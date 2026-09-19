import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ActorType, Prisma, TeamPayoutStatus, type TeamPayoutRequest } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { EARNINGS_AUDIT_ACTIONS } from "./earnings-audit-actions";
import { assertValidTeamPayoutTransition } from "../policies/team-payout-state-machine";
import {
  toTeamPayoutAuditSnapshot,
  toTeamPayoutListItem,
  toTeamPayoutRequestView,
  type TeamPayoutListItem,
  type TeamPayoutRequestView,
} from "../views/team-payout-views";
import type {
  ApproveTeamPayoutDto,
  ListPayoutsQueryDto,
  MarkFailedTeamPayoutDto,
  MarkPaidTeamPayoutDto,
  ProcessTeamPayoutDto,
  RejectTeamPayoutDto,
  ReviewTeamPayoutDto,
} from "../dto/team-payout.dto";

const DETAIL_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true, email: true } },
  approver: { select: { id: true, name: true, email: true } },
};

type PayoutDetail = Prisma.TeamPayoutRequestGetPayload<{ include: typeof DETAIL_INCLUDE }>;

/**
 * Finance-facing side of K12's payout review pipeline (`GET/POST
 * /payouts*`, all gated `finance.manage` except list/get which allow
 * `finance.read` too — see PayoutsController). The member-facing side
 * (creation, own-scoped reads) lives in TeamEarningsService — this service
 * never creates a TeamPayoutRequest, only transitions one that already
 * exists.
 *
 * `review`/`approve`/`process`/`mark-failed` are guarded by an explicit
 * `{ status: <expected>, version: dto.version }` `updateMany` (status +
 * optimistic-concurrency guard), not `@Idempotent()` — a second identical
 * call with a stale version is a genuine conflict for those, not a safe
 * replay. `mark-paid` is the opposite: it's `@Idempotent()`-guarded at the
 * controller AND, since a client may legitimately retry with a *different*
 * Idempotency-Key against an already-PAID request, this service treats
 * "already PAID" as success (returns the current state, 200) rather than a
 * conflict — the one deliberate exception to the version-guard pattern.
 */
@Injectable()
export class TeamPayoutsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthenticatedUser, query: ListPayoutsQueryDto): Promise<ListEnvelope<TeamPayoutListItem>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.TeamPayoutRequestWhereInput = {
      organization_id: actor.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teamPayoutRequest.findMany({
        where,
        include: { user: { select: { name: true } } },
        orderBy: { requested_at: "desc" },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.teamPayoutRequest.count({ where }),
    ]);

    return {
      data: rows.map(toTeamPayoutListItem),
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<TeamPayoutRequestView> {
    const payout = await this.findOrgPayoutOrThrow(actor, id);
    return toTeamPayoutRequestView(payout);
  }

  async review(actor: AuthenticatedUser, id: string, dto: ReviewTeamPayoutDto): Promise<TeamPayoutRequestView> {
    return this.transition(actor, id, {
      dtoVersion: dto.version,
      expectedStatus: TeamPayoutStatus.REQUESTED,
      targetStatus: TeamPayoutStatus.UNDER_REVIEW,
      auditAction: EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_REVIEWED,
      data: { reviewed_by: actor.id, reviewed_at: new Date() },
    });
  }

  async approve(actor: AuthenticatedUser, id: string, dto: ApproveTeamPayoutDto): Promise<TeamPayoutRequestView> {
    return this.transition(actor, id, {
      dtoVersion: dto.version,
      expectedStatus: TeamPayoutStatus.UNDER_REVIEW,
      targetStatus: TeamPayoutStatus.APPROVED,
      auditAction: EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_APPROVED,
      data: { approved_by: actor.id, approved_at: new Date() },
    });
  }

  /** REQUESTED or UNDER_REVIEW -> REJECTED — the only transition with two valid source statuses, so it can't use the single-`expectedStatus` `transition()` helper. */
  async reject(actor: AuthenticatedUser, id: string, dto: RejectTeamPayoutDto): Promise<TeamPayoutRequestView> {
    const preCheck = await this.findOrgPayoutOrThrow(actor, id);
    assertValidTeamPayoutTransition(preCheck.status, TeamPayoutStatus.REJECTED);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.teamPayoutRequest.findFirst({ where: { id, organization_id: actor.organizationId } });
      if (!current) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Payout request not found." });
      }
      assertValidTeamPayoutTransition(current.status, TeamPayoutStatus.REJECTED);
      this.assertVersion(current.version, dto.version);

      const result = await tx.teamPayoutRequest.updateMany({
        where: { id, organization_id: actor.organizationId, status: current.status, version: dto.version },
        data: {
          status: TeamPayoutStatus.REJECTED,
          rejected_at: new Date(),
          rejection_reason: dto.reason,
          version: { increment: 1 },
        },
      });
      this.assertUpdated(result.count);
      return tx.teamPayoutRequest.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
    });

    await this.recordAudit(actor, EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_REJECTED, updated);
    return toTeamPayoutRequestView(updated);
  }

  /** APPROVED or FAILED -> PROCESSING (retry). */
  async process(actor: AuthenticatedUser, id: string, dto: ProcessTeamPayoutDto): Promise<TeamPayoutRequestView> {
    const preCheck = await this.findOrgPayoutOrThrow(actor, id);
    assertValidTeamPayoutTransition(preCheck.status, TeamPayoutStatus.PROCESSING);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.teamPayoutRequest.findFirst({ where: { id, organization_id: actor.organizationId } });
      if (!current) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Payout request not found." });
      }
      assertValidTeamPayoutTransition(current.status, TeamPayoutStatus.PROCESSING);
      this.assertVersion(current.version, dto.version);

      const result = await tx.teamPayoutRequest.updateMany({
        where: { id, organization_id: actor.organizationId, status: current.status, version: dto.version },
        data: {
          status: TeamPayoutStatus.PROCESSING,
          processing_started_at: new Date(),
          processor: dto.processor,
          // A retry from FAILED clears the prior failure reason — it no longer describes the current attempt.
          failure_reason: null,
          version: { increment: 1 },
        },
      });
      this.assertUpdated(result.count);
      return tx.teamPayoutRequest.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
    });

    await this.recordAudit(actor, EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_PROCESSING_STARTED, updated);
    return toTeamPayoutRequestView(updated);
  }

  /**
   * `POST /payouts/:id/mark-paid` — `@Idempotent()`-guarded at the
   * controller (replay-safe for an identical Idempotency-Key). On top of
   * that, if the target is already PAID this returns the current state
   * unchanged (200) rather than a conflict — Document instruction: "Duplicate
   * mark-paid on an already PAID payout must return 200 unchanged."
   */
  async markPaid(actor: AuthenticatedUser, id: string, dto: MarkPaidTeamPayoutDto): Promise<TeamPayoutRequestView> {
    const preCheck = await this.findOrgPayoutOrThrow(actor, id);
    if (preCheck.status === TeamPayoutStatus.PAID) {
      return toTeamPayoutRequestView(preCheck);
    }
    assertValidTeamPayoutTransition(preCheck.status, TeamPayoutStatus.PAID);

    const { payout, changed } = await this.prisma.$transaction(async (tx) => {
      const current = await tx.teamPayoutRequest.findFirst({ where: { id, organization_id: actor.organizationId } });
      if (!current) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Payout request not found." });
      }
      if (current.status === TeamPayoutStatus.PAID) {
        const already = await tx.teamPayoutRequest.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
        return { payout: already, changed: false };
      }
      assertValidTeamPayoutTransition(current.status, TeamPayoutStatus.PAID);

      const result = await tx.teamPayoutRequest.updateMany({
        where: { id, organization_id: actor.organizationId, status: current.status },
        data: {
          status: TeamPayoutStatus.PAID,
          paid_at: new Date(),
          external_reference: dto.externalReference,
          version: { increment: 1 },
        },
      });
      this.assertUpdated(result.count);
      const fresh = await tx.teamPayoutRequest.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
      return { payout: fresh, changed: true };
    });

    if (changed) {
      await this.recordAudit(actor, EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_PAID, payout);
    }
    return toTeamPayoutRequestView(payout);
  }

  async markFailed(actor: AuthenticatedUser, id: string, dto: MarkFailedTeamPayoutDto): Promise<TeamPayoutRequestView> {
    return this.transition(actor, id, {
      dtoVersion: dto.version,
      expectedStatus: TeamPayoutStatus.PROCESSING,
      targetStatus: TeamPayoutStatus.FAILED,
      auditAction: EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_FAILED,
      data: { failure_reason: dto.reason },
    });
  }

  /** Shared single-expected-source-status transition, used by every route except `reject` (two valid sources) and `mark-paid` (its own already-PAID short-circuit). */
  private async transition(
    actor: AuthenticatedUser,
    id: string,
    opts: {
      dtoVersion: number;
      expectedStatus: TeamPayoutStatus;
      targetStatus: TeamPayoutStatus;
      auditAction: string;
      data: Prisma.TeamPayoutRequestUncheckedUpdateManyInput;
    }
  ): Promise<TeamPayoutRequestView> {
    const preCheck = await this.findOrgPayoutOrThrow(actor, id);
    assertValidTeamPayoutTransition(preCheck.status, opts.targetStatus);

    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.teamPayoutRequest.findFirst({ where: { id, organization_id: actor.organizationId } });
      if (!current) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Payout request not found." });
      }
      assertValidTeamPayoutTransition(current.status, opts.targetStatus);
      this.assertVersion(current.version, opts.dtoVersion);

      const result = await tx.teamPayoutRequest.updateMany({
        where: { id, organization_id: actor.organizationId, status: opts.expectedStatus, version: opts.dtoVersion },
        data: { status: opts.targetStatus, ...opts.data, version: { increment: 1 } },
      });
      this.assertUpdated(result.count);
      return tx.teamPayoutRequest.findUniqueOrThrow({ where: { id }, include: DETAIL_INCLUDE });
    });

    await this.recordAudit(actor, opts.auditAction, updated);
    return toTeamPayoutRequestView(updated);
  }

  private assertVersion(current: number, expected: number): void {
    if (current !== expected) {
      throw new ConflictException({
        code: "TEAM_PAYOUT_VERSION_CONFLICT",
        message: "This payout request was changed by someone else. Reload and try again.",
      });
    }
  }

  private assertUpdated(count: number): void {
    if (count !== 1) {
      throw new ConflictException({
        code: "TEAM_PAYOUT_VERSION_CONFLICT",
        message: "This payout request was changed by someone else. Reload and try again.",
      });
    }
  }

  private async recordAudit(actor: AuthenticatedUser, action: string, payout: TeamPayoutRequest): Promise<void> {
    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action,
      entityType: "TeamPayoutRequest",
      entityId: payout.id,
      after: toTeamPayoutAuditSnapshot({
        id: payout.id,
        userId: payout.user_id,
        amount: payout.amount.toFixed(2),
        status: payout.status,
        payoutMethod: payout.payout_method,
      }),
    });
  }

  private async findOrgPayoutOrThrow(actor: AuthenticatedUser, id: string): Promise<PayoutDetail> {
    const payout = await this.prisma.teamPayoutRequest.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!payout) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Payout request not found." });
    }
    return payout;
  }
}
