import type { PayoutMethod, Prisma, TeamPayoutRequest, TeamPayoutStatus, User } from "@prisma/client";

type ActorRef = Pick<User, "id" | "name" | "email">;

/** Point-in-time copy of PayoutProfile, captured once at request creation — never re-read afterward. */
export interface TeamPayoutDestinationSnapshot {
  method: PayoutMethod;
  accountHolderName?: string;
  bankName?: string;
  accountNumber?: string;
  ifsc?: string;
  upiId?: string;
}

/** `amount` is `Prisma.Decimal`, not `string` — see project-allocation-views.ts's doc comment on why the global response interceptor, not this file, is what formats it onto the wire. */
export interface TeamPayoutRequestView {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  amount: Prisma.Decimal;
  status: TeamPayoutStatus;
  payoutMethod: PayoutMethod;
  /** Full values — Finance needs them to actually pay; self-view also returns full (it's the member's own data). Frontend masks by default. */
  destination: TeamPayoutDestinationSnapshot;
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

export interface TeamPayoutListItem {
  id: string;
  userId: string;
  userName: string;
  amount: Prisma.Decimal;
  status: TeamPayoutStatus;
  payoutMethod: PayoutMethod;
  requestedAt: string;
  paidAt: string | null;
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toActorRef(user: ActorRef | null | undefined): ActorRef | null {
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

export function toTeamPayoutRequestView(
  request: TeamPayoutRequest & {
    user: Pick<User, "id" | "name" | "email">;
    reviewer: ActorRef | null;
    approver: ActorRef | null;
  }
): TeamPayoutRequestView {
  return {
    id: request.id,
    userId: request.user_id,
    userName: request.user.name,
    userEmail: request.user.email,
    amount: request.amount,
    status: request.status,
    payoutMethod: request.payout_method,
    destination: request.destination_snapshot as unknown as TeamPayoutDestinationSnapshot,
    requestedAt: request.requested_at.toISOString(),
    reviewedBy: toActorRef(request.reviewer),
    reviewedAt: toIso(request.reviewed_at),
    approvedBy: toActorRef(request.approver),
    approvedAt: toIso(request.approved_at),
    processingStartedAt: toIso(request.processing_started_at),
    processor: request.processor,
    paidAt: toIso(request.paid_at),
    rejectedAt: toIso(request.rejected_at),
    rejectionReason: request.rejection_reason,
    failureReason: request.failure_reason,
    externalReference: request.external_reference,
    version: request.version,
    createdAt: request.created_at.toISOString(),
    updatedAt: request.updated_at.toISOString(),
  };
}

export function toTeamPayoutListItem(
  request: TeamPayoutRequest & { user: Pick<User, "name"> }
): TeamPayoutListItem {
  return {
    id: request.id,
    userId: request.user_id,
    userName: request.user.name,
    amount: request.amount,
    status: request.status,
    payoutMethod: request.payout_method,
    requestedAt: request.requested_at.toISOString(),
    paidAt: toIso(request.paid_at),
  };
}

/**
 * Audit-safe — amounts, identities, and status only. NEVER includes
 * destination_snapshot contents (bank account number, IFSC, UPI ID) —
 * matches the existing finance-KYC review precedent
 * (toFinanceKycReviewAuditSnapshot) for excluding sensitive payout/PII
 * fields from the append-only audit trail.
 */
export function toTeamPayoutAuditSnapshot(input: {
  id: string;
  userId: string;
  amount: string;
  status: TeamPayoutStatus;
  payoutMethod: PayoutMethod;
}): Record<string, unknown> {
  return {
    teamPayoutRequestId: input.id,
    userId: input.userId,
    amount: input.amount,
    status: input.status,
    payoutMethod: input.payoutMethod,
  };
}
