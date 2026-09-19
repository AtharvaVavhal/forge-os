import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { ActorType, PayoutMethod, Prisma, TeamPayoutStatus } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import { AuditService } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { EARNINGS_AUDIT_ACTIONS } from "./earnings-audit-actions";
import { EarningsBalanceService } from "./earnings-balance.service";
import { TeamOnboardingGateService } from "../../team/services/team-onboarding-gate.service";
import type { CreateTeamPayoutRequestDto } from "../dto/team-payout.dto";
import {
  toTeamEarningEntryView,
  type TeamEarningEntryView,
  type TeamEarningsSummaryView,
} from "../views/team-earnings-views";
import {
  toTeamPayoutAuditSnapshot,
  toTeamPayoutRequestView,
  type TeamPayoutDestinationSnapshot,
  type TeamPayoutRequestView,
} from "../views/team-payout-views";

const DETAIL_INCLUDE = {
  user: { select: { id: true, name: true, email: true } },
  reviewer: { select: { id: true, name: true, email: true } },
  approver: { select: { id: true, name: true, email: true } },
};

/**
 * Member-facing side of K12 (`GET /team/earnings*`, `GET/POST
 * /team/payouts*`) — every method here is scoped by `actor.id`, never by a
 * client-supplied `userId` (there is no such parameter anywhere in this
 * service or its DTOs), so a TEAM_MEMBER cannot reach another member's
 * financial records. No `@RequirePermissions` on the routes that call this
 * service — ownership *is* the authorization, same pattern as
 * `team/kyc` and `team/payout-profile`.
 */
@Injectable()
export class TeamEarningsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly balance: EarningsBalanceService,
    private readonly onboardingGate: TeamOnboardingGateService
  ) {}

  async getSummary(actor: AuthenticatedUser): Promise<TeamEarningsSummaryView> {
    const balance = await this.balance.computeBalance(this.prisma, actor.organizationId, actor.id);
    return {
      available: balance.available,
      pending: balance.pending,
      lifetimeEarned: balance.lifetimeEarned,
      lifetimePaid: balance.lifetimePaid,
    };
  }

  async listOwnAllocationLines(
    actor: AuthenticatedUser,
    query: OffsetPaginationQueryDto
  ): Promise<ListEnvelope<TeamEarningEntryView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.ProjectAllocationLineWhereInput = {
      organization_id: actor.organizationId,
      user_id: actor.id,
      project_allocation: { status: "APPROVED" },
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.projectAllocationLine.findMany({
        where,
        include: { project_allocation: { include: { project: { select: { id: true, name: true } } } } },
        orderBy: { created_at: "desc" },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.projectAllocationLine.count({ where }),
    ]);

    return {
      data: rows.map(toTeamEarningEntryView),
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async listOwnPayouts(
    actor: AuthenticatedUser,
    query: { status?: TeamPayoutStatus } & OffsetPaginationQueryDto
  ): Promise<ListEnvelope<TeamPayoutRequestView>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const where: Prisma.TeamPayoutRequestWhereInput = {
      organization_id: actor.organizationId,
      user_id: actor.id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.teamPayoutRequest.findMany({
        where,
        include: DETAIL_INCLUDE,
        orderBy: { requested_at: "desc" },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.teamPayoutRequest.count({ where }),
    ]);

    return {
      data: rows.map(toTeamPayoutRequestView),
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async getOwnPayout(actor: AuthenticatedUser, id: string): Promise<TeamPayoutRequestView> {
    const payout = await this.prisma.teamPayoutRequest.findFirst({
      where: { id, organization_id: actor.organizationId, user_id: actor.id },
      include: DETAIL_INCLUDE,
    });
    if (!payout) {
      // Same 404 whether the id doesn't exist, belongs to another org, or
      // belongs to another member in this org — never leaks which case it is.
      throw new NotFoundException({ code: "NOT_FOUND", message: "Payout request not found." });
    }
    return toTeamPayoutRequestView(payout);
  }

  /**
   * `POST /team/payouts` — locks the requesting member's own `User` row
   * (`SELECT ... FOR UPDATE`), recomputes Available inside that lock, and
   * rejects `amount > Available`; this is what prevents two concurrent
   * requests both reading a stale Available and jointly overdrawing it.
   * `destination_snapshot` is copied from `PayoutProfile` once, here, and
   * never touched again even if the member's profile changes afterward.
   */
  async createPayoutRequest(actor: AuthenticatedUser, dto: CreateTeamPayoutRequestDto): Promise<TeamPayoutRequestView> {
    const amount = new Prisma.Decimal(dto.amount);
    if (!amount.isPositive()) {
      throw new BadRequestException({
        code: "PAYOUT_AMOUNT_MUST_BE_POSITIVE",
        message: "Withdrawal amount must be greater than zero.",
      });
    }

    // Phase 3 of the K5 onboarding redesign: KYC is never required to
    // *enter* Forge, only to withdraw. Checked before the balance lock —
    // KYC status has no concurrency concern, so failing fast here avoids
    // taking the row lock at all for a member who isn't verified yet.
    await this.onboardingGate.assertKycVerifiedForWithdrawal(actor.organizationId, actor.id);

    const created = await this.prisma.$transaction(async (tx) => {
      const lockedUsers = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users
        WHERE id = ${actor.id}::uuid AND organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;
      if (!lockedUsers[0]) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "User not found." });
      }

      const currentBalance = await this.balance.computeBalance(tx, actor.organizationId, actor.id);
      if (amount.greaterThan(currentBalance.available)) {
        throw new UnprocessableEntityException({
          code: "PAYOUT_EXCEEDS_AVAILABLE_BALANCE",
          message: "This withdrawal amount exceeds your available balance.",
          details: { available: currentBalance.available.toFixed(2), requested: amount.toFixed(2) },
        });
      }

      const profile = await tx.payoutProfile.findFirst({ where: { organization_id: actor.organizationId, user_id: actor.id } });
      const destination = this.buildDestinationSnapshot(profile);

      return tx.teamPayoutRequest.create({
        data: {
          organization_id: actor.organizationId,
          user_id: actor.id,
          amount,
          status: TeamPayoutStatus.REQUESTED,
          payout_method: destination.method,
          destination_snapshot: destination as unknown as Prisma.InputJsonValue,
        },
        include: DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: ActorType.USER,
      actorId: actor.id,
      action: EARNINGS_AUDIT_ACTIONS.TEAM_PAYOUT_REQUESTED,
      entityType: "TeamPayoutRequest",
      entityId: created.id,
      after: toTeamPayoutAuditSnapshot({
        id: created.id,
        userId: created.user_id,
        amount: created.amount.toFixed(2),
        status: created.status,
        payoutMethod: created.payout_method,
      }),
    });

    return toTeamPayoutRequestView(created);
  }

  /** Requires a complete BANK_TRANSFER + UPI payout profile — same completeness bar as `PayoutProfileService.upsertOwn`. */
  private buildDestinationSnapshot(
    profile: {
      preferred_method: PayoutMethod | null;
      account_holder_name: string | null;
      bank_name: string | null;
      account_number: string | null;
      ifsc: string | null;
      upi_id: string | null;
    } | null
  ): TeamPayoutDestinationSnapshot {
    if (
      !profile ||
      !profile.preferred_method ||
      !profile.account_holder_name ||
      !profile.bank_name ||
      !profile.account_number ||
      !profile.ifsc ||
      !profile.upi_id
    ) {
      throw new ConflictException({
        code: "PAYOUT_PROFILE_INCOMPLETE",
        message: "Add your bank and UPI details before requesting a withdrawal.",
      });
    }
    return {
      method: profile.preferred_method,
      accountHolderName: profile.account_holder_name,
      bankName: profile.bank_name,
      accountNumber: profile.account_number,
      ifsc: profile.ifsc,
      upiId: profile.upi_id,
    };
  }
}
