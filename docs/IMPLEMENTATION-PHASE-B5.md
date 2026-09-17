# FORGE Business OS — Implementation Phase B5: Finance Backend

**Status:** Implementation complete and verified. Finance E2E suites green against real PostgreSQL (57 tests). CRM / Sales / Projects regression e2e (117 tests) and unit tests (34) green. API typecheck and build green. B5-scoped eslint quiet-clean.
**Scope:** Document 5 §8–§9 / §13 / §19 (Invoices, Payments, Refunds, Credit Notes, Expenses, Forge Fund, Tax Rates, Sequences, Razorpay webhook), Document 6 §12 / §16 / §17 (HMAC webhook, financial security, Tier A audit). Frozen Prisma schema — **no migrations**.

---

## Architecture & Design Overview

Phase B5 delivers the self-contained Finance domain module. Money is `Prisma.Decimal` end-to-end (string DTOs on the wire). Lifecycle mutations use dedicated action endpoints — never arbitrary `PATCH { status }`. Forge Fund is an append-only ledger (`ForgeFundEntry` only); no payout tables, no hard-coded 60/40 split.

### Key Module Artifacts
- **Module Root:** `apps/api/src/modules/finance/`
  - `controllers/`: Invoices, Payments, Refunds, Credit Notes, Expenses, Forge Fund, Tax Rates, Sequences, Webhooks
  - `services/`: domain services + `SequencesService` (`SELECT … FOR UPDATE`), `RazorpayService`, `RazorpayOrdersService`, `scope-guards`
  - `policies/`: invoice state machine, Decimal money helpers (`computeLineTotal`, `snapshotRatesForTreatment`)
  - `dto/`: whitelist / `forbidNonWhitelisted` DTOs with money/tax/quantity string validators
- **Shared wiring (B5-only):**
  - `common/idempotency/` — `@Idempotent()` + interceptor (required `Idempotency-Key`, 24h in-memory store, in-flight serialization)
  - `common/http/raw-body.ts` — capture raw body for Razorpay HMAC (`bodyParser: false` in `main.ts` / e2e bootstrap)
  - Razorpay optional env in `configuration.ts` / `env.validation.ts`
  - Finance Tier A actions in `AUDIT_ACTIONS`
- **Testing:** `apps/api/test/finance-*.e2e-spec.ts` + `test/support/finance.ts`

---

## Implemented Routes

| Method | Path | Permission | Notes |
| --- | --- | --- | --- |
| GET/POST | `/invoices` | finance.read / manage | Create draft; Idempotency-Key required on POST |
| POST | `/invoices/from-proposal` | finance.manage | ACCEPTED proposal → draft with snapshotted lines |
| GET/PATCH | `/invoices/:id` | finance.read / manage | PATCH DRAFT only + `version` lock |
| PUT | `/invoices/:id/line-items` | finance.manage | Full replace, DRAFT only, atomic |
| POST | `/invoices/:id/send\|void\|cancel\|remind` | finance.manage | Dedicated transitions; remind → 202 (no outbox yet) |
| GET/POST | `/payments` | finance.read / manage | Offline methods only (no RAZORPAY) |
| POST | `/payments/razorpay/orders` | finance.manage | External order then PENDING Payment row |
| GET/POST | `/refunds` | finance.read / manage | Caps refundable; may REVERSE payment |
| GET/POST | `/credit-notes` (+ GET `:id`) | finance.read / manage | Own FY sequence |
| GET/POST/PATCH | `/expenses` | finance.read / manage | No detail GET (per Doc 5 inventory) |
| GET/POST | `/forge-fund-entries` (+ GET `:id`) | forge_fund.* | Manual create requires manage **and** approve |
| GET | `/forge-fund/balance` | forge_fund.read | `SUM(amount)` |
| GET/POST/PATCH | `/tax-rates` | finance.read / manage | Catalog; snapshotted onto invoice lines |
| GET | `/invoice-sequences`, `/credit-note-sequences` | finance.read | Read-only |
| POST | `/webhooks/razorpay` | HMAC | Public; raw-body verify before any DB write |

---

## State Machines & Financial Invariants

### Invoice
- Edit / line replace: **DRAFT only**
- Send: lock draft row → claim `InvoiceSequence` → freeze `bill_to_snapshot` → `SENT`
- Void: DRAFT + zero payments → `VOID`
- Cancel: reason required; if `paid_amount > 0` auto-issues CreditNote (`CANCELLATION`) in same txn
- Payment-driven: `SENT` / `PARTIALLY_PAID` / `PAID` via `deriveStatusAfterPayment`
- `OVERDUE`: enum exists; **no scheduler** in B5 (documented limitation)
- No soft-delete; no status PATCH

### Payments / Refunds
- Offline create under `SELECT … FOR UPDATE` on invoice (concurrent overpay race-safe)
- Razorpay completion **webhook only**; order path writes PENDING Payment with `razorpay_order_id`
- Webhook applies `paid_amount` only on transition **into** COMPLETED; never resurrects CANCELLED/VOID/DRAFT status
- Refunds re-lock payment + invoice; decrement `paid_amount`; full refund → `REVERSED`

### Tax snapshots
- Catalog TaxRates store both CGST/SGST and IGST legs; line snapshots zero unused legs via `snapshotRatesForTreatment` (prevents 36% double-count)

### Forge Fund
- Append-only; manual entries force `source_type`/`source_id` null
- Automatic CONTRIBUTION on Razorpay capture (`source_type=payment`); partial unique prevents double contribution
- Balance = sum of signed amounts; no 60/40, no TeamPayout

---

## Idempotency & Concurrency

- Required `Idempotency-Key` on Doc 5 §2.7 finance POSTs (missing → `400 IDEMPOTENCY_KEY_REQUIRED`)
- WebhookEvent unique → duplicate delivery 200 no-op
- Concurrent invoice send (same draft), payment overpay race, credit-note / invoice sequence races covered in e2e
- Unique constraints remain final backstops (`P2002` handled deliberately)

---

## RBAC & Isolation

| Permission | FOUNDER_ADMIN | FINANCE | SALES | TEAM_MEMBER | OPERATIONS |
| --- | --- | --- | --- | --- | --- |
| finance.read/manage | ✓ | ✓ | deny | deny | deny |
| forge_fund.read/manage/approve | ✓ | ✓ | deny | deny | deny |

Every query scopes `organization_id` from session; cross-org FKs → **404**. Nested IDOR covered in payments/security suites.

---

## Audit (Tier A)

Uses existing `AuditService` only:
- `invoice.sent` / `invoice.voided` / `invoice.cancelled`
- `payment.recorded` / `payment.completed_webhook`
- `refund.created` / `credit_note.issued`
- `forge_fund_entry.created` (+ webhook contribution constant reserved)

Expense / draft PATCH / line-items / remind / tax rates: not Tier A per Doc 5 §19.

---

## Verification & Test Results

### Finance E2E (57 passed)
- `finance-invoices.e2e-spec.ts` — CRUD, tax treatment, line math, numbering, same-draft concurrent send, from-proposal, lifecycle, RBAC
- `finance-payments.e2e-spec.ts` — offline pay/refund, overpay, idempotency required key + replay, concurrent payment race, IDOR
- `finance-ledger.e2e-spec.ts` — credit notes + concurrency, expenses, forge fund append-only / no 60/40, tax rates, sequences
- `finance-webhooks.e2e-spec.ts` — HMAC reject, capture chain, duplicate event_id, different event_id same payment, cancelled invoice non-resurrection
- `finance-security.e2e-spec.ts` — role matrix, org isolation, Tier A audit, rollback, whitelist/decimals

### Regression
- CRM + Sales + Projects e2e: **117 passed**
- Unit tests: **34 passed**
- `npm run typecheck:api`: 0 errors
- `npm run build --workspace apps/api`: success
- B5-scoped eslint `--quiet`: 0 errors  
  (Full `npm run lint:api` currently fails on **untracked** B6 `test/team-shared.e2e-spec.ts` — out of B5 commit scope.)

---

## Limitations / Open Decisions

1. **OVERDUE** — no cron/job; enum reserved.
2. **remind** — validates eligibility and returns 202; no Notifications/DomainEvent consumer in this phase (same precedent as B2/B3).
3. **Nightly Razorpay reconciliation** — not implemented (Doc 5 §9.3 alert-only job).
4. **CreditNoteLineItem** — schema exists; create API is line-less (matches current frontend contract); cancel auto-CN is amount-only.
5. **Live Razorpay order HTTP** — returns 503 when credentials unset; happy-path order creation not live-tested (webhook path is fully e2e-tested with PENDING seed / local order_id resolution).
6. **Manual offline payment → Forge Fund CONTRIBUTION** — Doc 5 §8.4 vs §13 ambiguity; implemented as **webhook-only** auto contribution.
7. **EXEMPT tax treatment** — never auto-selected (no frozen trigger).
8. **Portal pay / Team forge-fund alias** — out of B5 scope (portal / team phases).

---

## Boundary Verifications

- **Prisma schema / migrations:** untouched
- **B3 Sales / B4 Projects modules:** not rewritten
- **Frontend `apps/web`:** untouched (portal uncommitted work preserved, not staged)
- **No TeamPayout / 60/40 / soft-delete inventions**
- **B6 contamination excluded from commit:** `TeamModule`, notes/documents/notifications/search/audit-logs controllers left untracked; `SharedModule` restored to Audit + OrganizationContext only
