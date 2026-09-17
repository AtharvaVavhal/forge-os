import { ProposalStatus } from "@prisma/client";

/**
 * Document 5 §12.3: "DRAFT->SENT->VIEWED->ACCEPTED|REJECTED; SENT->EXPIRED
 * (cron). Revise = new row. Audit all transitions (A)." — combined with
 * §6.1's endpoint split and §19's inventory:
 *
 *   - DRAFT  -> SENT                      only via POST /proposals/:id/send
 *   - SENT   -> VIEWED | REJECTED | EXPIRED   only via POST .../transition
 *   - VIEWED -> REJECTED | EXPIRED            only via POST .../transition
 *   - *      -> ACCEPTED                  NEVER via this module — Document
 *     5 §6.1: "Accept primarily via portal" / §11: "POST
 *     /portal/proposals/:id/accept... only from SENT|VIEWED -> ACCEPTED."
 *     The frozen internal `/transition` route's own documented target set
 *     is exactly {VIEWED, REJECTED, EXPIRED} — ACCEPTED is deliberately
 *     absent, not merely unreachable by omission. B3 does not implement
 *     the portal, so nothing in this phase can ever produce an ACCEPTED
 *     proposal through a real endpoint (only e2e test fixtures seed one
 *     directly, mirroring how B2 tested Deal WON before Proposals
 *     existed).
 *   - ACCEPTED/REJECTED/EXPIRED -> *       Forbidden (terminal, immutable)
 *
 * `(cron)` next to SENT->EXPIRED describes *one* way expiry can happen
 * (a scheduled job — not implemented in this phase, no scheduler
 * infrastructure exists) — it does not mean EXPIRED is unreachable
 * through the manual endpoint; Document 5 §19's own inventory row for
 * `/transition` explicitly lists "Viewed/Reject/Expire" as its three
 * manual targets.
 */
const TRANSITIONS: Record<ProposalStatus, readonly ProposalStatus[]> = {
  [ProposalStatus.DRAFT]: [], // DRAFT -> SENT is its own endpoint (send()), not this table.
  [ProposalStatus.SENT]: [ProposalStatus.VIEWED, ProposalStatus.REJECTED, ProposalStatus.EXPIRED],
  [ProposalStatus.VIEWED]: [ProposalStatus.REJECTED, ProposalStatus.EXPIRED],
  [ProposalStatus.ACCEPTED]: [],
  [ProposalStatus.REJECTED]: [],
  [ProposalStatus.EXPIRED]: [],
};

export function isValidProposalTransition(from: ProposalStatus, to: ProposalStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isProposalDraft(status: ProposalStatus): boolean {
  return status === ProposalStatus.DRAFT;
}

export function isProposalTerminal(status: ProposalStatus): boolean {
  return (
    status === ProposalStatus.ACCEPTED ||
    status === ProposalStatus.REJECTED ||
    status === ProposalStatus.EXPIRED
  );
}

/** The Prisma column each transition target's timestamp lives in — a clean 1:1 mapping, one field per status. */
export function timestampFieldFor(status: ProposalStatus): "sent_at" | "viewed_at" | "rejected_at" | "expires_at" | null {
  switch (status) {
    case ProposalStatus.SENT:
      return "sent_at";
    case ProposalStatus.VIEWED:
      return "viewed_at";
    case ProposalStatus.REJECTED:
      return "rejected_at";
    case ProposalStatus.EXPIRED:
      return "expires_at";
    default:
      return null;
  }
}
