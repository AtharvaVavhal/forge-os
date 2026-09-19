import type { Prisma, ProjectAllocation, ProjectAllocationLine, ProjectAllocationStatus, User } from "@prisma/client";

type ActorRef = Pick<User, "id" | "name" | "email">;

/**
 * Money fields are typed `Prisma.Decimal`, not `string`, even though the
 * wire response renders them as `"1234.00"`-shaped strings — the global
 * `CamelCaseResponseInterceptor` (`toCamelCase`/`formatDecimal`) is what
 * turns a `Prisma.Decimal` into a fixed-2-place string on the way out
 * (decimal.js's own `.toString()`/`.toJSON()` silently drops trailing
 * zeros, e.g. `"8000.00"` -> `"8000"` — see camel-case.ts). Calling
 * `.toString()` here ourselves would convert too early, before that
 * interceptor ever sees a Decimal to reformat. Same convention as
 * `InvoicesService.withPendingAmount`.
 */
export interface ProjectAllocationLineView {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: Prisma.Decimal;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAllocationView {
  id: string;
  projectId: string;
  projectName: string;
  status: ProjectAllocationStatus;
  adjustmentOfId: string | null;
  /** Live-computed while DRAFT/CANCELLED; the frozen approval-time value once APPROVED. */
  revenue: Prisma.Decimal;
  expenses: Prisma.Decimal;
  distributable: Prisma.Decimal;
  totalAllocated: Prisma.Decimal;
  /** SUM across every APPROVED round for the project (including this one, if approved). */
  projectCumulativeApprovedTotal: Prisma.Decimal;
  /** distributable - projectCumulativeApprovedTotal. */
  projectRemaining: Prisma.Decimal;
  createdBy: ActorRef;
  approvedBy: ActorRef | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  version: number;
  lines: ProjectAllocationLineView[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAllocationListItem {
  id: string;
  projectId: string;
  projectName: string;
  status: ProjectAllocationStatus;
  adjustmentOfId: string | null;
  totalAllocated: Prisma.Decimal;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toActorRef(user: ActorRef | null | undefined): ActorRef | null {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export function toProjectAllocationLineView(
  line: ProjectAllocationLine & { user: Pick<User, "name" | "email"> }
): ProjectAllocationLineView {
  return {
    id: line.id,
    userId: line.user_id,
    userName: line.user.name,
    userEmail: line.user.email,
    amount: line.amount,
    note: line.note,
    createdAt: line.created_at.toISOString(),
    updatedAt: line.updated_at.toISOString(),
  };
}

export function toProjectAllocationView(
  allocation: ProjectAllocation & {
    project: { name: string };
    creator: ActorRef;
    approver: ActorRef | null;
    lines: (ProjectAllocationLine & { user: Pick<User, "name" | "email"> })[];
  },
  live: { revenue: Prisma.Decimal; expenses: Prisma.Decimal; distributable: Prisma.Decimal },
  projectCumulativeApprovedTotal: Prisma.Decimal
): ProjectAllocationView {
  const revenue = allocation.revenue_snapshot ?? live.revenue;
  const expenses = allocation.expenses_snapshot ?? live.expenses;
  const distributable = allocation.distributable_snapshot ?? live.distributable;
  const remaining = distributable.minus(projectCumulativeApprovedTotal);

  return {
    id: allocation.id,
    projectId: allocation.project_id,
    projectName: allocation.project.name,
    status: allocation.status,
    adjustmentOfId: allocation.adjustment_of_id,
    revenue,
    expenses,
    distributable,
    totalAllocated: allocation.total_allocated,
    projectCumulativeApprovedTotal,
    projectRemaining: remaining,
    createdBy: toActorRef(allocation.creator)!,
    approvedBy: toActorRef(allocation.approver),
    approvedAt: toIso(allocation.approved_at),
    cancelledAt: toIso(allocation.cancelled_at),
    version: allocation.version,
    lines: allocation.lines.map(toProjectAllocationLineView),
    createdAt: allocation.created_at.toISOString(),
    updatedAt: allocation.updated_at.toISOString(),
  };
}

export function toProjectAllocationListItem(
  allocation: ProjectAllocation & { project: { name: string } }
): ProjectAllocationListItem {
  return {
    id: allocation.id,
    projectId: allocation.project_id,
    projectName: allocation.project.name,
    status: allocation.status,
    adjustmentOfId: allocation.adjustment_of_id,
    totalAllocated: allocation.total_allocated,
    approvedAt: toIso(allocation.approved_at),
    createdAt: allocation.created_at.toISOString(),
    updatedAt: allocation.updated_at.toISOString(),
  };
}

/** Audit-safe — amounts and identities only, matching existing Tier-A audit conventions for this domain. */
export function toProjectAllocationAuditSnapshot(input: {
  id: string;
  projectId: string;
  status: ProjectAllocationStatus;
  totalAllocated: string;
  adjustmentOfId?: string | null;
}): Record<string, unknown> {
  return {
    projectAllocationId: input.id,
    projectId: input.projectId,
    status: input.status,
    totalAllocated: input.totalAllocated,
    ...(input.adjustmentOfId !== undefined ? { adjustmentOfId: input.adjustmentOfId } : {}),
  };
}
