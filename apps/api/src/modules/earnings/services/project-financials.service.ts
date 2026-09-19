import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";

/** Either the main PrismaService or a `$transaction` callback's `tx` client — both expose the same model methods used here. */
type PrismaOrTx = PrismaService | Prisma.TransactionClient;

/**
 * K11 revenue/expense/distributable-pool computation. Deliberately not
 * stored on Project — always derived live from Payment/Refund/Expense.
 * CreditNote is accrual-basis documentation only (never touches Payment or
 * Invoice.paid_amount — confirmed via credit-notes.service.ts) and must
 * never be subtracted here; including it would double-count or incorrectly
 * reduce cash-basis revenue for records that may represent no cash
 * movement at all.
 */
@Injectable()
export class ProjectFinancialsService {
  constructor(private readonly prisma: PrismaService) {}

  /** SUM(COMPLETED Payment.amount) - SUM(COMPLETED Refund.amount) for the project, via Invoice.project_id. */
  async computeRevenue(
    client: PrismaOrTx,
    organizationId: string,
    projectId: string
  ): Promise<Prisma.Decimal> {
    const [paymentsAgg, refundsAgg] = await Promise.all([
      client.payment.aggregate({
        where: {
          organization_id: organizationId,
          status: "COMPLETED",
          invoice: { project_id: projectId },
        },
        _sum: { amount: true },
      }),
      client.refund.aggregate({
        where: {
          organization_id: organizationId,
          status: "COMPLETED",
          payment: { invoice: { project_id: projectId } },
        },
        _sum: { amount: true },
      }),
    ]);
    const gross = new Prisma.Decimal(paymentsAgg._sum.amount ?? 0);
    const refunded = new Prisma.Decimal(refundsAgg._sum.amount ?? 0);
    return gross.minus(refunded);
  }

  /** SUM(Expense.amount) for the project — every row counts; Expense has no approval state in this schema. */
  async computeExpenses(
    client: PrismaOrTx,
    organizationId: string,
    projectId: string
  ): Promise<Prisma.Decimal> {
    const agg = await client.expense.aggregate({
      where: { organization_id: organizationId, project_id: projectId },
      _sum: { amount: true },
    });
    return new Prisma.Decimal(agg._sum.amount ?? 0);
  }

  /** max(0, revenue - expenses). */
  async computeDistributable(
    client: PrismaOrTx,
    organizationId: string,
    projectId: string
  ): Promise<Prisma.Decimal> {
    const [revenue, expenses] = await Promise.all([
      this.computeRevenue(client, organizationId, projectId),
      this.computeExpenses(client, organizationId, projectId),
    ]);
    const raw = revenue.minus(expenses);
    return raw.isNegative() ? new Prisma.Decimal(0) : raw;
  }

  /**
   * SUM(ProjectAllocation.total_allocated) across every APPROVED round for
   * the project — signed (a correction round's total may be negative). This
   * is the cumulative figure the live distributable pool must never be
   * exceeded by; it spans multiple rows and so cannot be a DB CHECK
   * constraint — callers must compute this inside the same locked
   * transaction that will freeze/approve a round.
   */
  async computeCumulativeApprovedAllocated(
    client: PrismaOrTx,
    organizationId: string,
    projectId: string
  ): Promise<Prisma.Decimal> {
    const agg = await client.projectAllocation.aggregate({
      where: { organization_id: organizationId, project_id: projectId, status: "APPROVED" },
      _sum: { total_allocated: true },
    });
    return new Prisma.Decimal(agg._sum.total_allocated ?? 0);
  }
}
