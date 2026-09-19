import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { PENDING_TEAM_PAYOUT_STATUSES } from "../policies/team-payout-state-machine";

type PrismaOrTx = PrismaService | Prisma.TransactionClient;

export interface MemberEarningsBalance {
  lifetimeEarned: Prisma.Decimal;
  pending: Prisma.Decimal;
  lifetimePaid: Prisma.Decimal;
  /** max(0, lifetimeEarned - pending - lifetimePaid) — never negative. */
  available: Prisma.Decimal;
  /** max(0, lifetimePaid - (lifetimeEarned - pending)) — Finance-only, never shown as a negative member balance. */
  recoveryOwed: Prisma.Decimal;
}

/**
 * K12 balance computation — frozen accounting clarification:
 *   Pending = REQUESTED + UNDER_REVIEW + APPROVED + PROCESSING + FAILED
 *   Paid    = PAID
 *   Rejected requests are excluded from both.
 *   Available     = max(0, LifetimeEarned - Pending - Paid)
 *   RecoveryOwed  = max(0, Paid - (LifetimeEarned - Pending))
 *
 * LifetimeEarned is SUM(ProjectAllocationLine.amount) for the user across
 * every APPROVED ProjectAllocation — signed, so correction/clawback lines
 * net out automatically. There is no separate earnings ledger table:
 * ProjectAllocationLine (once its parent is APPROVED) *is* the ledger,
 * computed at query time — the same pattern ForgeFundEntry already uses
 * for its own balance.
 */
@Injectable()
export class EarningsBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async computeLifetimeEarned(
    client: PrismaOrTx,
    organizationId: string,
    userId: string
  ): Promise<Prisma.Decimal> {
    const agg = await client.projectAllocationLine.aggregate({
      where: {
        organization_id: organizationId,
        user_id: userId,
        project_allocation: { status: "APPROVED" },
      },
      _sum: { amount: true },
    });
    return new Prisma.Decimal(agg._sum.amount ?? 0);
  }

  async computeBalance(
    client: PrismaOrTx,
    organizationId: string,
    userId: string
  ): Promise<MemberEarningsBalance> {
    const [lifetimeEarned, pendingAgg, paidAgg] = await Promise.all([
      this.computeLifetimeEarned(client, organizationId, userId),
      client.teamPayoutRequest.aggregate({
        where: {
          organization_id: organizationId,
          user_id: userId,
          status: { in: [...PENDING_TEAM_PAYOUT_STATUSES] },
        },
        _sum: { amount: true },
      }),
      client.teamPayoutRequest.aggregate({
        where: { organization_id: organizationId, user_id: userId, status: "PAID" },
        _sum: { amount: true },
      }),
    ]);

    const pending = new Prisma.Decimal(pendingAgg._sum.amount ?? 0);
    const lifetimePaid = new Prisma.Decimal(paidAgg._sum.amount ?? 0);
    const netEarned = lifetimeEarned.minus(pending);

    const availableRaw = netEarned.minus(lifetimePaid);
    const available = availableRaw.isNegative() ? new Prisma.Decimal(0) : availableRaw;

    const recoveryRaw = lifetimePaid.minus(netEarned);
    const recoveryOwed = recoveryRaw.isNegative() ? new Prisma.Decimal(0) : recoveryRaw;

    return { lifetimeEarned, pending, lifetimePaid, available, recoveryOwed };
  }
}
