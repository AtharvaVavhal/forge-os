import type { ProjectAllocationStatus, TeamPayoutStatus } from "./types";

export function isProjectAllocationEditable(status: ProjectAllocationStatus): boolean {
  return status === "DRAFT";
}

export function canApproveProjectAllocation(status: ProjectAllocationStatus): boolean {
  return status === "DRAFT";
}

export function canCancelProjectAllocation(status: ProjectAllocationStatus): boolean {
  return status === "DRAFT";
}

export function canAdjustProjectAllocation(status: ProjectAllocationStatus): boolean {
  return status === "APPROVED";
}

export function canReviewPayout(status: TeamPayoutStatus): boolean {
  return status === "REQUESTED";
}

export function canApprovePayout(status: TeamPayoutStatus): boolean {
  return status === "UNDER_REVIEW";
}

export function canRejectPayout(status: TeamPayoutStatus): boolean {
  return status === "REQUESTED" || status === "UNDER_REVIEW";
}

export function canProcessPayout(status: TeamPayoutStatus): boolean {
  return status === "APPROVED" || status === "FAILED";
}

export function canMarkPayoutPaid(status: TeamPayoutStatus): boolean {
  return status === "PROCESSING";
}

export function canMarkPayoutFailed(status: TeamPayoutStatus): boolean {
  return status === "PROCESSING";
}

export function isTeamPayoutTerminal(status: TeamPayoutStatus): boolean {
  return status === "PAID" || status === "REJECTED";
}
