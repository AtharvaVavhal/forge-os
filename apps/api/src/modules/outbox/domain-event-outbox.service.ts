import { Injectable, Logger } from "@nestjs/common";
import { DomainEventStatus, type DomainEvent } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import {
  DOMAIN_EVENT_BACKOFF_MS,
  DOMAIN_EVENT_MAX_ATTEMPTS,
  DOMAIN_EVENT_TYPES,
} from "./domain-event.constants";
import { DealWonConsumer } from "./consumers/deal-won.consumer";
import { ProposalAcceptedConsumer } from "./consumers/proposal-accepted.consumer";
import { ProposalSentConsumer } from "./consumers/proposal-sent.consumer";

/** In-flight claim marker stored in last_error while a worker processes (B9 M6). */
const CLAIM_PREFIX = "__PROCESSING__:";
const CLAIM_TTL_MS = 5 * 60 * 1000;

/**
 * Transactional outbox processor (Document 5 §14).
 * Claim via FOR UPDATE SKIP LOCKED + processing lease; process; mark PROCESSED/FAILED.
 * Exported for E2E to invoke deterministically without waiting on the interval worker.
 */
@Injectable()
export class DomainEventOutboxService {
  private readonly logger = new Logger(DomainEventOutboxService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dealWon: DealWonConsumer,
    private readonly proposalAccepted: ProposalAcceptedConsumer,
    private readonly proposalSent: ProposalSentConsumer
  ) {}

  /** Process up to `limit` due PENDING events. Returns how many were attempted. */
  async processPending(limit = 50): Promise<{ attempted: number; processed: number; failed: number }> {
    const now = Date.now();
    const candidates = await this.prisma.domainEvent.findMany({
      where: { status: DomainEventStatus.PENDING },
      orderBy: { created_at: "asc" },
      take: limit * 3, // over-fetch then filter backoff in memory
    });

    let attempted = 0;
    let processed = 0;
    let failed = 0;

    for (const event of candidates) {
      if (attempted >= limit) break;
      if (!this.isDue(event, now)) continue;
      if (this.hasActiveClaim(event, now)) continue;

      attempted += 1;
      const result = await this.processOne(event.id);
      if (result === "processed") processed += 1;
      if (result === "failed") failed += 1;
    }

    return { attempted, processed, failed };
  }

  async processOne(eventId: string): Promise<"processed" | "failed" | "skipped"> {
    // B9 M6: exclusive claim — skip locked rows; set processing lease so concurrent
    // workers do not dispatch the same PENDING event without a PROCESSING enum.
    const claimed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; last_error: string | null }>>`
        SELECT id, last_error
        FROM domain_events
        WHERE id = ${eventId}::uuid
          AND status = 'PENDING'::"DomainEventStatus"
        FOR UPDATE SKIP LOCKED
      `;
      if (rows.length !== 1) {
        return null;
      }
      const now = Date.now();
      const lease = rows[0]!.last_error;
      if (lease?.startsWith(CLAIM_PREFIX)) {
        const claimedAt = Number(lease.slice(CLAIM_PREFIX.length));
        if (Number.isFinite(claimedAt) && now - claimedAt < CLAIM_TTL_MS) {
          return null;
        }
      }

      return tx.domainEvent.update({
        where: { id: eventId },
        data: {
          attempts: { increment: 1 },
          last_error: `${CLAIM_PREFIX}${now}`,
        },
      });
    });

    if (!claimed) {
      return "skipped";
    }

    try {
      await this.dispatch(claimed);
      await this.prisma.domainEvent.update({
        where: { id: eventId },
        data: {
          status: DomainEventStatus.PROCESSED,
          processed_at: new Date(),
          last_error: null,
        },
      });
      return "processed";
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`DomainEvent ${eventId} (${claimed.type}) failed: ${message}`);

      const terminal = claimed.attempts >= DOMAIN_EVENT_MAX_ATTEMPTS;
      await this.prisma.domainEvent.update({
        where: { id: eventId },
        data: {
          status: terminal ? DomainEventStatus.FAILED : DomainEventStatus.PENDING,
          last_error: message.slice(0, 2000),
        },
      });
      return terminal ? "failed" : "skipped";
    }
  }

  /**
   * Test helper: force an event back to PENDING with a synthetic failure
   * already recorded (attempts left below max) so retry paths can be exercised.
   */
  async markPendingWithError(eventId: string, errorMessage: string): Promise<void> {
    await this.prisma.domainEvent.update({
      where: { id: eventId },
      data: {
        status: DomainEventStatus.PENDING,
        last_error: errorMessage,
      },
    });
  }

  private hasActiveClaim(event: DomainEvent, nowMs: number): boolean {
    if (!event.last_error?.startsWith(CLAIM_PREFIX)) return false;
    const claimedAt = Number(event.last_error.slice(CLAIM_PREFIX.length));
    return Number.isFinite(claimedAt) && nowMs - claimedAt < CLAIM_TTL_MS;
  }

  private isDue(event: DomainEvent, nowMs: number): boolean {
    if (event.attempts <= 0) return true;
    const backoff = DOMAIN_EVENT_BACKOFF_MS * Math.max(1, event.attempts);
    return event.updated_at.getTime() + backoff <= nowMs;
  }

  private async dispatch(event: DomainEvent): Promise<void> {
    switch (event.type) {
      case DOMAIN_EVENT_TYPES.DEAL_WON:
        await this.dealWon.handle(event);
        return;
      case DOMAIN_EVENT_TYPES.PROPOSAL_ACCEPTED:
        await this.proposalAccepted.handle(event);
        return;
      case DOMAIN_EVENT_TYPES.PROPOSAL_SENT:
        await this.proposalSent.handle(event);
        return;
      default:
        this.logger.warn(`Unknown DomainEvent type "${event.type}" — marking processed as no-op`);
    }
  }
}
