export const PROJECT_ALLOCATION_STATUSES = ["DRAFT", "APPROVED", "CANCELLED"] as const;
export type ProjectAllocationStatus = (typeof PROJECT_ALLOCATION_STATUSES)[number];

export const TEAM_PAYOUT_STATUSES = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PROCESSING",
  "PAID",
  "REJECTED",
  "FAILED",
] as const;
export type TeamPayoutStatus = (typeof TEAM_PAYOUT_STATUSES)[number];

export const PAYOUT_METHODS = ["BANK_TRANSFER", "UPI"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export interface ActorRef {
  id: string;
  name: string;
  email: string;
}

export interface ProjectAllocationLine {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  /** Server decimal string, e.g. "3300.00" or "-500.00" — never parsed as a number here. */
  amount: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAllocation {
  id: string;
  projectId: string;
  projectName: string;
  status: ProjectAllocationStatus;
  adjustmentOfId: string | null;
  revenue: string;
  expenses: string;
  distributable: string;
  totalAllocated: string;
  projectCumulativeApprovedTotal: string;
  projectRemaining: string;
  createdBy: ActorRef;
  approvedBy: ActorRef | null;
  approvedAt: string | null;
  cancelledAt: string | null;
  version: number;
  lines: ProjectAllocationLine[];
  createdAt: string;
  updatedAt: string;
}

export interface ProjectAllocationListItem {
  id: string;
  projectId: string;
  projectName: string;
  status: ProjectAllocationStatus;
  adjustmentOfId: string | null;
  totalAllocated: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Full values (bank account number, IFSC, UPI ID) — every caller of this type must mask before rendering. */
export interface TeamPayoutDestination {
  method: PayoutMethod;
  accountHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
}

export interface TeamPayoutRequest {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: string;
  status: TeamPayoutStatus;
  payoutMethod: PayoutMethod;
  destination: TeamPayoutDestination;
  requestedAt: string;
  reviewedBy: ActorRef | null;
  reviewedAt: string | null;
  approvedBy: ActorRef | null;
  approvedAt: string | null;
  processingStartedAt: string | null;
  processor: string | null;
  paidAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  failureReason: string | null;
  externalReference: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Finance-only balance breakdown attached to `GET/POST /payouts*` responses
 * (never to `/team/payouts*`). `recoveryOwed` only ever appears here.
 */
export interface TeamPayoutMemberBalance {
  lifetimeEarned: string;
  pending: string;
  lifetimePaid: string;
  available: string;
  recoveryOwed: string;
}

export interface TeamPayoutRequestFinanceView extends TeamPayoutRequest {
  memberBalance: TeamPayoutMemberBalance;
}

export interface TeamPayoutListItem {
  id: string;
  userId: string;
  userName: string;
  amount: string;
  status: TeamPayoutStatus;
  payoutMethod: PayoutMethod;
  requestedAt: string;
  paidAt: string | null;
}

/** `recoveryOwed` is deliberately absent — Finance-only, never surfaced to a member. */
export interface TeamEarningsSummary {
  available: string;
  pending: string;
  lifetimeEarned: string;
  lifetimePaid: string;
}

export interface TeamEarningEntry {
  id: string;
  projectId: string;
  projectName: string;
  amount: string;
  status: "APPROVED";
  date: string;
}

export interface OffsetList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
}
