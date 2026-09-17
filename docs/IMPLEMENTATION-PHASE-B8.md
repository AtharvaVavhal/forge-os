# FORGE Business OS — Implementation Phase B8: Integration + E2E / DealWon Outbox

**Status:** Implemented against Document 5 §13–14 and Red Team §3. Verified with integration lifecycle E2E against real PostgreSQL.
**Scope:** Connect B0–B7 into the operational DealWon outbox lifecycle. **No Prisma migrations.** Proposal ACCEPTED does **not** auto-Won.

---

## 1. Scope

| In | Out |
| --- | --- |
| DomainEvent outbox worker | Maintenance / support reply APIs |
| Deal → WON sync: Project + `DealWon` event | ProposalAccepted → Deal WON |
| DealWon async: template (no-op), draft invoice, CLIENT invite, notify | Portal FE changes |
| ProposalAccepted / ProposalSent consumers | Redis / new event tables |
| Integration + security + idempotency E2E | Schema changes |

---

## 2. Architecture

```
Portal accept → Proposal ACCEPTED + DomainEvent(ProposalAccepted)
                     ↓ (async) notify owner “ready for Won”
Staff POST /deals/:id/transition → WON
                     ↓ ONE txn
              Deal.stage=WON + Project + DomainEvent(DealWon)
                     ↓ OutboxModule worker / processPending()
              template → draft invoice → invite → notify
```

`OutboxModule` imports `FinanceModule` only for draft invoice creation. Deal WON sync uses Prisma inside `CrmModule` — no CRM↔Finance cycle.

---

## 3. DealWon Transaction

`DealsService.applyWonTransition`:

1. Require ACCEPTED proposal + `company_id`
2. `updateMany` stage → WON (non-terminal only)
3. Find-or-create Project (`ACTIVE` / `PLANNING`, `accepted_proposal_id`, `deal_id`, `company_id`, owner)
4. Find-or-create `DomainEvent(DealWon)` keyed by `aggregate_id = deal.id`
5. Audit `deal.transitioned`

Concurrent WON: one stage winner; retry observes WON and ensures Project/event exist.

---

## 4. DomainEvent / Outbox Worker

- `DomainEventOutboxService.processPending` / `processOne`
- Claim: `updateMany` where `status=PENDING` + increment `attempts`
- Success → `PROCESSED`; failure → `PENDING` + `last_error` (or `FAILED` after 8 attempts)
- Backoff: `updated_at + attempts * 1000ms`
- `DomainEventWorkerService`: 2s interval; **disabled when `NODE_ENV=test`** (E2E calls `drainOutbox`)

---

## 5. Consumers

| Event | Behavior |
| --- | --- |
| `DealWon` | Template no-op (empty config); draft invoice via `InvoicesService.createDraftFromAcceptedProposalForDealWon`; CLIENT invite if contact email and no ClientUser/open invite; notify owner |
| `ProposalAccepted` | Notify deal owner `proposal.accepted_ready_for_won` — **never** WON |
| `ProposalSent` | Insert on send (txn); notify owner |

---

## 6. Idempotency

| Object | Key |
| --- | --- |
| Project | one per `deal_id` (find-before-create) |
| DealWon event | one per `aggregate_id=deal.id` |
| Draft invoice | one DRAFT per `project_id` |
| Invitation | skip if ClientUser or open invite for email+company |
| Notification | JSON payload equality match |

---

## 7. Retry Strategy

Attempts increment on claim. Transient failures leave `PENDING` with backoff. After `DOMAIN_EVENT_MAX_ATTEMPTS` (8) → `FAILED`.

---

## 8. Security Boundaries

Unchanged B7 portal plane + company scope. Integration E2E asserts cross-plane JWT rejection and cross-company 404.

---

## 9. E2E Coverage

- `apps/api/test/integration-lifecycle.e2e-spec.ts` — full lifecycle, duplicate WON, worker idempotency, controlled failure/retry, security
- `crm-deals` WON case asserts Project + DealWon event

### Test results (NODE_ENV=test, `--runInBand`)

| Suite | Result |
| --- | --- |
| API e2e (25 suites) | **309 passed** |
| API unit (5 suites) | **34 passed** |
| typecheck | PASS |
| lint (`--quiet`) | **0 errors** |
| build | PASS |
| prisma schema/migrations | **unchanged** |
---

## 10. Known Limitations

- Project template milestone blueprint remains empty (no DB template table) — apply is a documented no-op
- Portal pay returns 503 without Razorpay credentials; lifecycle E2E completes payment via PENDING payment + webhook
- `GET /domain-events` ops API still not implemented
- Nightly Razorpay reconciliation job not implemented (Red Team backstop)

---

## 11. Explicit Non-Goals

Maintenance portal, ticket replies, portal notification APIs, auto-Won on accept, Prisma schema changes, frontend work.

---

## 12. Production Considerations

- Enable worker outside test (`NODE_ENV≠test`); set `DOMAIN_EVENT_WORKER_ENABLED=false` to pause
- Monitor `DomainEvent` PENDING/FAILED counts
- Configure Razorpay for live portal checkout
