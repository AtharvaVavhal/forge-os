/** DomainEvent.type values used by B8 outbox (Document 5 §14). */
export const DOMAIN_EVENT_TYPES = {
  DEAL_WON: "DealWon",
  PROPOSAL_ACCEPTED: "ProposalAccepted",
  PROPOSAL_SENT: "ProposalSent",
} as const;

export type DomainEventType = (typeof DOMAIN_EVENT_TYPES)[keyof typeof DOMAIN_EVENT_TYPES];

/** After this many failed attempts the event is marked FAILED. */
export const DOMAIN_EVENT_MAX_ATTEMPTS = 8;

/** Base backoff between retries (ms); multiplied by attempts. */
export const DOMAIN_EVENT_BACKOFF_MS = 1_000;
