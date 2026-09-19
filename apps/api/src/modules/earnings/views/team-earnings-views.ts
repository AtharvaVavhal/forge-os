import type { Prisma, ProjectAllocationLine } from "@prisma/client";

/**
 * The member's own earnings summary. `recoveryOwed` is deliberately absent
 * from this type — it is Finance-only (see EarningsBalanceService) and must
 * never be shown to the member as a negative balance; `available` is
 * already floored at zero. Money fields are `Prisma.Decimal`, not `string`
 * — see project-allocation-views.ts's doc comment: the global response
 * interceptor formats these onto the wire, not this file.
 */
export interface TeamEarningsSummaryView {
  available: Prisma.Decimal;
  pending: Prisma.Decimal;
  lifetimeEarned: Prisma.Decimal;
  lifetimePaid: Prisma.Decimal;
}

export interface TeamEarningEntryView {
  id: string;
  projectId: string;
  projectName: string;
  amount: Prisma.Decimal;
  status: "APPROVED";
  date: string;
}

export function toTeamEarningEntryView(
  line: ProjectAllocationLine & {
    project_allocation: { approved_at: Date | null; created_at: Date; project: { id: string; name: string } };
  }
): TeamEarningEntryView {
  const date = line.project_allocation.approved_at ?? line.project_allocation.created_at;
  return {
    id: line.id,
    projectId: line.project_allocation.project.id,
    projectName: line.project_allocation.project.name,
    amount: line.amount,
    status: "APPROVED",
    date: date.toISOString(),
  };
}
