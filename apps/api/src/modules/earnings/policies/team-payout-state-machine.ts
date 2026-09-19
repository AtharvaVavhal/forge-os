import { ConflictException } from "@nestjs/common";
import { TeamPayoutStatus } from "@prisma/client";

/**
 * K12:
 *   REQUESTED    -> UNDER_REVIEW | REJECTED
 *   UNDER_REVIEW -> APPROVED | REJECTED
 *   APPROVED     -> PROCESSING
 *   PROCESSING   -> PAID | FAILED
 *   FAILED       -> PROCESSING | REJECTED
 * PAID and REJECTED are terminal.
 */
const VALID_TRANSITIONS: Record<TeamPayoutStatus, ReadonlySet<TeamPayoutStatus>> = {
  REQUESTED: new Set([TeamPayoutStatus.UNDER_REVIEW, TeamPayoutStatus.REJECTED]),
  UNDER_REVIEW: new Set([TeamPayoutStatus.APPROVED, TeamPayoutStatus.REJECTED]),
  APPROVED: new Set([TeamPayoutStatus.PROCESSING]),
  PROCESSING: new Set([TeamPayoutStatus.PAID, TeamPayoutStatus.FAILED]),
  FAILED: new Set([TeamPayoutStatus.PROCESSING, TeamPayoutStatus.REJECTED]),
  PAID: new Set(),
  REJECTED: new Set(),
};

export const TERMINAL_TEAM_PAYOUT_STATUSES: ReadonlySet<TeamPayoutStatus> = new Set([
  TeamPayoutStatus.PAID,
  TeamPayoutStatus.REJECTED,
]);

/**
 * Accounting clarification (frozen): Pending = every non-terminal-success,
 * non-rejected status — including FAILED, since a failed transfer can still
 * be retried (FAILED -> PROCESSING) and the amount remains reserved until
 * it's either paid or explicitly rejected.
 */
export const PENDING_TEAM_PAYOUT_STATUSES: ReadonlySet<TeamPayoutStatus> = new Set([
  TeamPayoutStatus.REQUESTED,
  TeamPayoutStatus.UNDER_REVIEW,
  TeamPayoutStatus.APPROVED,
  TeamPayoutStatus.PROCESSING,
  TeamPayoutStatus.FAILED,
]);

export function assertValidTeamPayoutTransition(
  current: TeamPayoutStatus,
  target: TeamPayoutStatus
): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.has(target)) {
    throw new ConflictException({
      code: "TEAM_PAYOUT_INVALID_TRANSITION",
      message: `Invalid status transition from ${current} to ${target}.`,
    });
  }
}
