import { DealStage } from "@prisma/client";

/**
 * Document 5 §12.2, verbatim:
 *
 *   * (non-terminal) -> next stage   Linear sales path              Audit A
 *   * (non-terminal) -> LOST         lost_reason required            Audit A
 *   * (non-terminal) -> WON          >=1 ACCEPTED proposal            Audit A, Project + DomainEvent DealWon
 *   WON/LOST          -> *           Forbidden; use reopen -> new Deal
 *
 * The linear path (excludes the two terminal stages, which are only
 * reachable via the LOST/WON branch rules, never via "next stage"):
 */
export const DEAL_LINEAR_ORDER: readonly DealStage[] = [
  DealStage.NEW,
  DealStage.CONTACTED,
  DealStage.QUALIFIED,
  DealStage.DISCOVERY,
  DealStage.PROPOSAL_SENT,
  DealStage.NEGOTIATION,
];

export function isDealTerminal(stage: DealStage): boolean {
  return stage === DealStage.WON || stage === DealStage.LOST;
}

/** The single next stage in the linear path, or `null` if `stage` is the last non-terminal stage or already terminal. */
export function nextLinearStage(stage: DealStage): DealStage | null {
  const index = DEAL_LINEAR_ORDER.indexOf(stage);
  if (index === -1 || index === DEAL_LINEAR_ORDER.length - 1) return null;
  return DEAL_LINEAR_ORDER[index + 1] ?? null;
}
