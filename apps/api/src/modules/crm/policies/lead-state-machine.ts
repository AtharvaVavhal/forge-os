import { LeadStatus } from "@prisma/client";

/**
 * Document 5 §12.1, verbatim:
 *
 *   NEW                        -> CONTACTED    (Manual or first Activity)
 *   CONTACTED                  -> QUALIFIED     (Manual)
 *   QUALIFIED                  -> CONVERTED     (Convert API only, Audit A)
 *   NEW/CONTACTED/QUALIFIED    -> DISQUALIFIED  (Manual, Audit A)
 *   CONVERTED/DISQUALIFIED     -> *              Forbidden
 *
 * `CONVERTED` is deliberately excluded from `TRANSITIONS` below — it is
 * only reachable through `LeadsService.convert()`, never through the
 * generic `/transition` endpoint (Document 5 §5.3: "convert only from
 * QUALIFIED... API accepts convert when status is QUALIFIED"). A caller
 * attempting `POST /leads/:id/transition { to: "CONVERTED" }` gets a
 * distinct, explicit error telling them to use `/convert` instead, not a
 * silent success that bypasses the convert transaction (deal creation,
 * duplicate-conversion guard, audit).
 *
 * "first Activity" auto-transition is NOT implemented — see
 * docs/IMPLEMENTATION-PHASE-B2.md's frozen-architecture-conflicts section:
 * `Activity` has no `lead_id` column and its DB CHECK constraint only
 * permits company/contact/deal/project as the exactly-one parent, so an
 * Activity can never reference a Lead in the frozen schema. Only the
 * "Manual" transition (which the same table row also allows) is
 * implementable without a schema change.
 */
const TRANSITIONS: Record<LeadStatus, readonly LeadStatus[]> = {
  [LeadStatus.NEW]: [LeadStatus.CONTACTED, LeadStatus.DISQUALIFIED],
  [LeadStatus.CONTACTED]: [LeadStatus.QUALIFIED, LeadStatus.DISQUALIFIED],
  [LeadStatus.QUALIFIED]: [LeadStatus.DISQUALIFIED],
  [LeadStatus.CONVERTED]: [],
  [LeadStatus.DISQUALIFIED]: [],
};

/** Tier A per Document 5 §12.1 ("Audit" column = "A"). */
export const LEAD_AUDITED_TRANSITIONS: readonly LeadStatus[] = [LeadStatus.DISQUALIFIED];

export function isValidLeadTransition(from: LeadStatus, to: LeadStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isLeadTerminal(status: LeadStatus): boolean {
  return status === LeadStatus.CONVERTED || status === LeadStatus.DISQUALIFIED;
}
