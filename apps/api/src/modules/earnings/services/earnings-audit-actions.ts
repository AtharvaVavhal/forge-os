/**
 * K11/K12 audit action strings — same `resource.snake_verb_past_tense`
 * convention as `AUDIT_ACTIONS` in `modules/shared/audit.service.ts`. Kept
 * separate from that file rather than merged into it, matching how each
 * domain's action set is otherwise self-contained; recorded through the
 * same shared `AuditService.record()`.
 */
export const EARNINGS_AUDIT_ACTIONS = {
  PROJECT_ALLOCATION_CREATED: "project_allocation.created",
  PROJECT_ALLOCATION_APPROVED: "project_allocation.approved",
  PROJECT_ALLOCATION_CANCELLED: "project_allocation.cancelled",
  PROJECT_ALLOCATION_ADJUSTED: "project_allocation.adjusted",
  TEAM_PAYOUT_REQUESTED: "team_payout.requested",
  TEAM_PAYOUT_REVIEWED: "team_payout.reviewed",
  TEAM_PAYOUT_APPROVED: "team_payout.approved",
  TEAM_PAYOUT_REJECTED: "team_payout.rejected",
  TEAM_PAYOUT_PROCESSING_STARTED: "team_payout.processing_started",
  TEAM_PAYOUT_PAID: "team_payout.paid",
  TEAM_PAYOUT_FAILED: "team_payout.failed",
} as const;
