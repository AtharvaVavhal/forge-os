# FORGE Business OS — Red Team Review

Several things in the v1 spec are wrong or underspecified. Flagged inline as **CHANGE FROM PREVIOUS SPEC**.

---

## 1. Data Model Red Team

**Missing entities:**

- `CreditNote` — GST compliance requires credit notes for invoice corrections/cancellations, distinct from `Refund` (a Refund is money back to the client; a Credit Note is a legal correction to a tax invoice, sometimes with no money movement at all, e.g. a scope reduction). You had none.
- `WebhookEvent` — log of every inbound Razorpay event (`id`, `razorpay_event_id` unique, `payload`, `processed_at`, `status`). Required for idempotency (§3) and reconciliation (§4). Missing entirely from v1.
- `InvitationToken` — for both team and client invites: `token`, `email`, `role_or_scope`, `expires_at`, `used_at`, `revoked_at`. v1 had client portal access as a vague "prepared" step with no real entity backing it — that's an actual security hole (§6).
- `TaxRate` — CGST/SGST/IGST rates and HSN/SAC-to-rate mapping should be a lookup table, not hardcoded logic scattered across invoice generation code.
- **CHANGE FROM PREVIOUS SPEC**: I mentioned an "Account" concept for retainer/maintenance invoices in passing and never defined it. Cut it — `Invoice.project_id` nullable + `Invoice.maintenance_contract_id` nullable covers it without inventing an undefined entity.

**Unnecessary as separate tables:**

- `HandoverChecklist` + `ChecklistItem` as two relational tables is overkill for a fixed 5-8 item list. Store as a JSONB array on `Project` (`handover_checklist: [{item, done, done_at, done_by}]`). Relational only earns its cost if checklist items need independent querying/reporting — they don't.

**Bad/missing relationships — the pairs you asked about specifically:**

| Relationship Problem Fix  |                                                                                                                                                                                                                               |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lead → Deal               | v1 didn't specify what happens to the Lead row after conversion                                                                                                                                                               | Lead gets `status: converted`, `converted_to_deal_id` set, never deleted — it's the attribution record for lead-source reporting.                                                                                                                                                                                                                                                                                                                                                                                                         |
| Deal → Proposal           | v1 said Invoice line items "reference" Proposal line items — this is a live FK to mutable data                                                                                                                                | **CHANGE FROM PREVIOUS SPEC.** Proposal line items must be **immutable per version** (new Proposal row per version, not mutated in place — v1 said this for the Proposal but didn't enforce it structurally). Add `unique(deal_id, version)`.                                                                                                                                                                                                                                                                                             |
| Proposal → Project        | Project should reference the *specific accepted Proposal version*, not just `deal_id` then "whatever the latest proposal is"                                                                                                  | `Project.accepted_proposal_id` FK, set once at creation, immutable after.                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Project → Invoice         | v1 said invoice line items "reference" proposal line items                                                                                                                                                                    | **CHANGE FROM PREVIOUS SPEC.** Invoice line items must be a **snapshot copy** at invoice-creation time (description, qty, unit\_price, tax\_rate copied as values, not FKs). If you later edit the Proposal or a Company's GSTIN, historical invoices must not silently change. This is the single most important correction in this review — a live join here is a real compliance and audit bug waiting to happen.                                                                                                                      |
| Invoice → Payment         | v1 said "derive `paid_amount`, never store"                                                                                                                                                                                   | **CHANGE FROM PREVIOUS SPEC.** At scale (hundreds of invoices, dashboard queries), deriving via `SUM(payments)` on every read is fine at low volume but becomes the exact "expensive query" flagged in §15. Correct approach: `Invoice.paid_amount` is a **cached column**, updated transactionally whenever a Payment is inserted/reversed, with source-of-truth reconciliation being `SUM(Payment.amount) WHERE invoice_id = X AND status = 'completed'` run as a periodic consistency job. Cache for reads, reconcile for correctness. |
| Project → Maintenance     | Fine as designed (`MaintenanceContract.project_id`), but v1 didn't say what happens to `Project.status` when a `MaintenanceContract` is created — does Project stay "Completed" forever while Maintenance runs independently? | Yes — explicitly decouple. `Project.status = completed` is terminal; `MaintenanceContract` has its own lifecycle and is the thing that's "active." Don't reopen a completed Project for maintenance work — that's what the contract + its own SupportTickets are for.                                                                                                                                                                                                                                                                     |
| Company → Contact         | v1 correctly made Contact.company\_id nullable, but didn't handle: what happens to a Contact's Deals/Invoices if their Company is later merged/deleted                                                                        | Company gets **soft delete only** (`archived_at`), never hard delete — see below.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Fields that must be computed, not stored:** `Deal.days_in_stage`, `Project.percent_complete` (derive from milestone completion), `Invoice.pending_amount` (= amount − paid\_amount, itself cached per above).

**Fields needing unique constraints:** `Invoice.invoice_number` (scoped per financial year — see §18, this is a compliance requirement, not a nice-to-have), `Payment.razorpay_payment_id`, `WebhookEvent.razorpay_event_id`, `User.email`, `Contact.email` (scoped, not globally unique — two companies can have contacts who share a personal email in edge cases, but scope uniqueness to `(company_id, email)` at minimum to catch real duplicates).

**Soft delete required (never hard delete):** Company, Contact, Deal, Project, Invoice, Payment, Document (anything that's ever been financially or contractually relevant). Hard delete of these breaks audit trails and can invalidate historical invoices/tax records — GST law requires you retain invoice records; you architecturally cannot allow a hard delete path to reach `Invoice`.

**Hard delete acceptable:** Notification (once read/expired), draft-only Task/Note that was never sent to a client, unused Lead that never converted (with a retention window, not immediate).

**Cascading delete risk:** if `Company` is deleted (even soft), don't cascade-soft-delete `Invoice`/`Payment` — financial records must survive independently of CRM hygiene actions. Use `RESTRICT` or `SET NULL` semantics for the FK from Invoice back to Company, never `CASCADE`.

**Polymorphic relation problem:** the nullable-FK-per-type pattern for `Activity`/`Note`/`Document` (recommended in v1) has two real issues: (1) no DB-level guarantee exactly one FK is set — add a `CHECK` constraint enforcing exactly-one-non-null; (2) adding a new attachable entity type later requires a migration to add a column. Accepted tradeoff — the entity set attaching to these (Company/Contact/Deal/Project/Invoice) is small and stable, so integrity wins over flexibility here. Do not switch to a generic `(entity_type, entity_id)` string-typed polymorphic pattern — it silently loses FK integrity and is how orphaned rows happen at scale.

---

## 2. State Machines

Format: states / allowed transitions / trigger / auto-effects / audit.

**Lead**
`New → Contacted → Qualified → Converted` and `New/Contacted/Qualified → Disqualified`

- Trigger: Sales role manually, or auto (`New→Contacted` on first logged Activity)
- `Converted` is **terminal and irreversible** — creates a Deal, sets `converted_to_deal_id`. Reversing requires deleting the Deal, not un-converting the Lead.
- Audit: required on `Converted`, `Disqualified`.

**Deal**
`New → Contacted → Qualified → Discovery → Proposal Sent → Negotiation → Won | Lost`

- Any stage can move to `Lost` directly (deals die at any point) — `Lost` requires `lost_reason` (enum, mandatory, non-null).
- `Won` requires at least one `Accepted` Proposal to exist — **enforce at the API layer**, block `Won` transition otherwise. This prevents the "Won with nothing sold" data integrity gap v1 didn't address.
- `Won`/`Lost` are terminal. Reopening a Lost deal = create a new Deal referencing the old one (`reopened_from_deal_id`), never mutate a closed Deal's stage back.
- Audit: required on every stage change (this is your core pipeline reporting data — cannot be a "some events" table, all Deal stage transitions are Tier A audit, see §9).

**Proposal**
`Draft → Sent → Viewed → Accepted | Rejected`, `Sent → Expired` (time-based, cron)

- `Draft → Sent`: creates immutable snapshot version, generates client-facing link.
- Editing after `Sent`: **not a transition, it's a new Proposal row** (`version + 1`, `deal_id` same, previous version's status frozen at whatever it was).
- `Accepted` is terminal for that version and triggers Deal eligibility for `Won` (doesn't auto-move Deal — a human still confirms Won, since "accepted proposal" and "deal actually closed/contracted" can have a gap, e.g. waiting on signed PO).
- Audit: required on all transitions, especially `Accepted` (this is your legal record of what was agreed).

**Project**
`status`: `active → on_hold ⇄ active → at_risk ⇄ active → completed | cancelled`
`phase`: `Planning → Design → Development → QA → Client Review → Deployment → Handover → Completed` (linear, no skipping without explicit override + reason logged)

- `phase` transitions trigger checks: `Client Review → Deployment` blocked unless the gating Milestone has `approved_at` set (from §3 of v1 spec).
- `completed` requires `HandoverChecklist` fully checked — **enforce at API layer**, don't let a Project silently close with an incomplete handover.
- Audit: phase changes and status changes both required.

**Milestone**
`Pending → In Progress → Completed`, optional `requires_client_approval` gate adds `Awaiting Approval` between `In Progress` and `Completed`.

- Reversible (`Completed → In Progress` allowed with reason, e.g. client requested rework) — this must be explicit and logged, not silently allowed by any role.
- Audit: required only if `requires_client_approval = true` (Tier A); routine milestone progress is Tier B (§9).

**Task**
`To Do → In Progress → In Review → Done`, `Blocked` as a side-flag not a stage (a task can be Blocked while In Progress).

- No audit required on routine transitions (too noisy) — audit only assignment changes and Done-then-reopened.

**Invoice**
`Draft → Sent → Partially Paid → Paid`, `Sent/Partially Paid → Overdue` (time-based), `Draft → Void`, `Sent/Partially Paid/Overdue → Cancelled` (requires reason + CreditNote if any payment exists)

- **Draft is the only freely editable state.** Once `Sent`, line items are frozen (see §1 snapshot decision) — corrections after Sent require a CreditNote, never in-place edit.
- `Void` only valid from `Draft` (no money ever moved) — hard-blocks Void if any Payment row exists against it, must use Cancel+CreditNote path instead.
- Audit: every transition, mandatory (financial — Tier A).

**Payment**
`Pending → Completed | Failed`, `Completed → Reversed` (via Refund, never edited in place)

- Created only via webhook (Razorpay) or manual entry (offline payment, requires `recorded_by`).
- **Never deleted, ever** — reversal is a new `Refund` row referencing the original Payment, not a mutation or delete.
- Audit: mandatory on every state, including `Failed` (needed for reconciliation).

**MaintenanceContract**
`Active → Expiring Soon (computed, not stored) → Expired | Renewed | Cancelled`

- `Renewed` creates a new contract period (new row or a `renewed_from_contract_id` chain), doesn't mutate dates on the old one — you want history of renewal, not just a rolling end-date.
- Audit: required on Cancelled (client-facing, financial implication), not required on routine renewal.

**SupportTicket**
`Open → In Progress → Waiting on Client → Resolved → Closed`, `Waiting on Client → In Progress` (client replies), `Resolved → Reopened` (client disputes resolution, time-boxed e.g. 7 days, then locked)

- Audit: only on Closed/Reopened — routine status pings are Tier C.

---

## 3. Business Transaction Safety

**Deal → Won cascade.** Don't run this as one giant transaction spanning external calls (template lookup is fine, but "portal access prepared" and notification-sending are I/O to other systems and shouldn't hold a DB transaction open).

Correct pattern — **transactional outbox**:

1. Single DB transaction: update `Deal.status = Won`, create `Project` row (status=Planning, phase=Planning), insert a `DomainEvent('DealWon', payload)` row in the same transaction. Commit.
2. Background worker picks up the `DealWon` event, and **idempotently** (keyed on `deal_id`, check-before-act): applies the Project template (creates Milestones/Tasks), drafts (not sends) the first Invoice, generates the client invitation token.
3. If step 2 fails partway (e.g. template application succeeds, invoice draft fails), the worker retries the *remaining* unfinished actions only — each sub-action checks "does this already exist for this project?" before creating, so retries are safe.
4. Deal.Won and Project creation are never rolled back because a downstream convenience action failed — the core business fact (we won the deal) must persist even if template automation has a bug that day. A human sees a "template application failed" alert and fixes it manually.

**Payment webhook.** `WebhookEvent` table with `unique(razorpay_event_id)` — insert first (this is your idempotency gate: duplicate delivery hits the unique constraint, no-op, return 200 immediately). Then in one transaction: upsert `Payment` (unique on `razorpay_payment_id`, so a retried webhook that got a new event ID but same payment ID still doesn't double-insert), update `Invoice.paid_amount` (cached column, §1), conditionally insert `ForgeFundEntry` (deduped by `unique(source_ref, type)` so this specific payment can only ever generate one contribution entry, even if the handler somehow runs twice). Notification send happens **outside** this transaction, as a fire-and-forget job — a failed email must never roll back a recorded payment.

**Transactions vs background jobs — the rule:** anything that's pure DB state + must be atomic with the triggering write → same transaction. Anything involving an external call (email, webhook to another service, PDF generation, portal invite email) → emit an event in the same transaction, process it async. Never hold a DB transaction open across a network call to a third party — that's a lock-contention and timeout risk once you have concurrent users.

---

## 4. Finance Red Team

- **Can an invoice be edited after payment?** No. Any payment (even partial) locks line items. Corrections go through `CreditNote`.
- **Can a payment be deleted?** No, never. Only reversed via `Refund`.
- **Refunds:** `Refund(id, payment_id, amount, reason, approved_by, razorpay_refund_id, status)` — a partial refund is allowed (`amount ≤ payment.amount − already_refunded`), full refund flips `Payment.status = Reversed`.
- **Credit notes:** separate entity (§1), required for GST-compliant invoice corrections, may exist with zero payment impact (pure scope/price correction) — don't conflate with Refund.
- **Webhook delivered twice:** handled by `WebhookEvent` unique constraint (§3) — second delivery is a guaranteed no-op.
- **Payment succeeds but our API crashes before processing the webhook:** Razorpay retries webhooks automatically (their side has retry-with-backoff) — but as a backstop, run a nightly reconciliation job that pulls Razorpay's payment list for the last 48h and diffs against local `Payment` rows by `razorpay_payment_id`, alerting on any gateway-side payment with no local record.
- **Reconciliation:** the nightly job above is the actual source-of-truth check — Razorpay is authoritative for "did money move," your DB is authoritative for "what does it mean for this invoice/client." Mismatches raise an internal alert, not silently self-heal (a silent auto-fix on financial data is itself a risk).
- **Preventing Forge Fund double-counting:** `unique(source_ref, type)` constraint on `ForgeFundEntry` where `source_ref = payment_id` for automatic contributions — DB-level guarantee, not application-level discipline alone. Manual entries always have `source_ref = null` and require `approved_by`, so they're structurally distinguishable from automatic ones in reporting.
- **Manual/offline payments:** `Payment.method ∈ {razorpay, cash, bank_transfer, cheque}`, gateway fields (`razorpay_payment_id`, `WebhookEvent` link) null for offline methods, `recorded_by` + mandatory audit log entry required since there's no third-party verification — offline payments are a bigger fraud/error surface, treat them with more logging, not less.

**Source of truth summary:**

| Number Source of truth  |                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------- |
| Invoice paid amount     | Cached on Invoice, reconciled against `SUM(Payment)`                                            |
| Revenue                 | `SUM(Payment.amount) WHERE status=completed`, by payment date not invoice date                  |
| Outstanding balance     | `Invoice.amount − Invoice.paid_amount`, per invoice                                             |
| Forge Fund balance      | `SUM(ForgeFundEntry.amount)`, full ledger scan (cheap at this volume, don't cache)              |
| Profitability           | `Revenue(project) − Expense(project) − allocated TimeEntry cost`, computed report, never stored |

---

## 5. Security Red Team

**Top vulnerabilities this architecture could create if built carelessly, and mitigations:**

1. **IDOR on sequential-looking resource access** (guessing invoice/document IDs). Mitigation: UUIDs everywhere (already specified), but UUIDs alone aren't authorization — every single-resource GET (`/invoices/:id`, `/documents/:id`) must re-check `belongs to requester's scope` server-side, not just "UUID is unguessable so it's fine." Unguessable ≠ authorized.
2. **Object-level authorization gaps on detail endpoints** — the classic bug is scoping the *list* endpoint correctly (`WHERE company_id = X`) but forgetting the same check on the *detail-by-id* endpoint, since it "already has the ID" and feels safe. Mitigation: a shared `PortalScopeGuard` applied at the NestJS module/route level for all `/portal/*` controllers, not per-handler discipline — architecturally impossible to forget, not just a code review checklist item.
3. **Signed URL leakage.** Document links shared over email/WhatsApp can be forwarded. Mitigation: short expiry (10-15 min), regenerate on each portal page load, never long-lived/public R2 URLs. Accept that a truly malicious authorized viewer can still download-and-forward the file itself — that's a policy problem, not solvable at the URL layer.
4. **Cross-tenant session confusion.** If internal-user and client-portal sessions share cookie domain/name, a bug in session handling could let a client session be treated as staff. Mitigation: separate cookie names/paths (`forge_session` vs `portal_session`), separate JWT audiences (`aud: internal` vs `aud: portal`), portal JWT **cannot** be validated by internal-API guards even if someone tries.
5. **CSRF on state-changing portal actions** (accept proposal, initiate payment). Mitigation: `SameSite=Strict` cookies + CSRF token on POST/PATCH portal routes, since these are exactly the "client clicks a button" actions attackers would target via a malicious page.
6. **Webhook spoofing.** Anyone can POST to your Razorpay webhook endpoint pretending to be Razorpay. Mitigation: **verify Razorpay's webhook signature on every request** (HMAC with your webhook secret) before touching the DB — this was not mentioned in v1 and is a real gap; an unverified webhook endpoint is a direct "mark any invoice as paid" attack.
7. **Invitation token reuse.** Client invite links, if not single-use, could be forwarded/reused indefinitely. Mitigation: `InvitationToken.used_at` set on first use, subsequent attempts rejected; expiry (e.g. 7 days).
8. **Password reset / account takeover.** Standard but must be stated: reset tokens single-use, short-lived (15-30 min), invalidate all existing sessions on password change, rate-limit reset requests per email/IP.
9. **File upload as attack vector** (malicious file masquerading as a document, e.g. an uploaded "requirements.docx" that's actually an executable, or a zip bomb). Mitigation: validate file type by content-sniffing not just extension, size-limit uploads, and — realistically for V1 — skip full antivirus scanning (ClamAV integration is real infra overhead for a 5-person internal tool) but do restrict accepted MIME types tightly and never serve uploaded files with a content-type that allows browser execution (`Content-Disposition: attachment` always).
10. **Brute force on portal login.** Client portal is your most exposed surface (external users, lower trust). Mitigation: rate limit login attempts per email+IP, exponential lockout, no user-enumeration in error messages ("invalid credentials" not "email not found").

---

## 6. Client Portal Red Team — walkthrough

| Attack Where it's stopped                              |                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Access another project by guessing/changing the URL ID | `PortalScopeGuard` on every `/portal/projects/:id` route — checks `project.company_id == session.company_id` before any data returns, not just on list                                                                                                                                                                                                                                                                                                                                                     |
| Guess another invoice ID                               | Same guard pattern on `/portal/invoices/:id` — company-scoped, not "is this ID valid"                                                                                                                                                                                                                                                                                                                                                                                                                      |
| Access another document                                | Document access always resolved through its **parent entity's** scope check (Document → Project/Company → company\_id match), never a bare `/documents/:id` lookup with no parent scope                                                                                                                                                                                                                                                                                                                    |
| Access internal notes                                  | Structurally impossible if `Note.visibility` filtering happens in the query itself (`WHERE visibility = 'client_visible'`), not as a post-fetch filter in application code — never fetch-then-hide, always filter-in-query                                                                                                                                                                                                                                                                                 |
| Change invoice/payment status                          | Portal API is **read-only** for Invoice/Payment except for a single explicit "Pay Now" action that hits the Razorpay checkout flow — no portal endpoint accepts arbitrary status writes to Invoice, full stop                                                                                                                                                                                                                                                                                              |
| Manipulate proposal acceptance                         | "Accept" is a single dedicated endpoint that only transitions `Sent/Viewed → Accepted` for the proposal matching the session's deal/company — not a generic status-update endpoint                                                                                                                                                                                                                                                                                                                         |
| Upload malicious files                                 | Support ticket attachments go through the same MIME/size validation as internal uploads (§5.9), stored with non-executable content-disposition                                                                                                                                                                                                                                                                                                                                                             |
| Abuse support tickets (spam creation)                  | Rate limit ticket creation per client account per hour                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Reuse an expired invitation                            | `InvitationToken.expires_at` checked server-side on every use attempt, not just at link-generation time                                                                                                                                                                                                                                                                                                                                                                                                    |
| Reuse an old session after portal access is revoked    | Session/JWT must carry a short TTL (e.g. 24h) **and** be checked against a live "is this client account active" flag on each request for sensitive actions (payment, document download) — a stale-but-unexpired JWT for a since-revoked client should still fail on the active-status check. This is the actual gap in v1: "what happens when a client loses portal access" wasn't answered — answer: revoke = flip `ClientUser.active = false`, checked on every portal request, not just session expiry. |

**Rule that governs all of this:** authorization happens in the query layer (WHERE clauses scoped by session identity), never as an after-the-fact filter on already-fetched data, and never trusted from the client (no "companyId" in the request body determining scope — always derived from the authenticated session server-side).

---

## 7. UX Red Team

**8-hour daily use — friction points in the v1 design:**

- Logging a call/email as an Activity from a Deal's detail page, then separately updating `next_follow_up_at` — should be one inline action ("Log activity" modal includes a follow-up date field), not two.
- Converting a Won Deal's proposal line items into invoice line items — should be a one-click "Generate Invoice from Proposal" action that pre-fills (then the user edits/confirms), not manual re-entry.
- Creating a Contact while creating a Deal (new prospect, no existing Contact yet) — must support inline Contact creation inside the Deal form, not a forced navigate-away-and-back.
- Task creation from a Project should support quick-add (title + assignee, hit enter, done) inline in the task list, full detail form only needed for edits.

**Fast path — New Lead → Handover:**

1. Lead captured (form/manual) → one-click "Qualify → Create Deal" (carries Contact/Company forward, no re-entry)
2. Deal detail page → "New Proposal" (pre-fills Company/Contact/service type from Deal)
3. Proposal → Send (generates client link + logs Activity automatically, no manual "log that I sent it")
4. Client Accepts (portal action) → Deal shows "Ready to mark Won" prompt (not automatic — human confirms)
5. Mark Won → Project auto-created + templated (§3) — zero manual setup
6. Project → "Generate Invoice" from accepted proposal (pre-filled, one click to send)
7. Payment webhook → auto-updates Invoice, notifies internal + client, zero manual reconciliation
8. Milestones progress → client sees automatically via portal, no manual status-report emails
9. Handover checklist → completed inline on Project page
10. "Close Project" button only enabled when checklist 100% done (enforced, §2)

Every arrow above should require **at most one click plus a confirm**, not a re-navigate-and-re-enter-data. The measure of whether this system is good: can a team member run steps 1-10 without ever typing the client's name/email more than once.

**Command palette / shortcuts earn their place at:** step 2 (jump to "New Proposal" without navigating menus), step 6 (jump to "Generate Invoice"), and global entity search (find any Company/Deal/Project by typing a few letters) — these are the highest-frequency actions in an 8-hour day.

---

## 8. Search / Filter / Views

| Table Default columns Filters Sort Saved views Bulk actions Export  |                                                    |                                         |                                |                          |                               |                                    |
| ------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------- | ------------------------------ | ------------------------ | ----------------------------- | ---------------------------------- |
| Deals                                                               | Name, Company, Stage, Value, Owner, Next follow-up | Stage, Owner, Source, Date range        | Value, Created, Next follow-up | Yes (per-user)           | Bulk owner reassign           | CSV                                |
| Companies                                                           | Name, Contacts, Active projects, Last activity     | Tag, Has active project                 | Name, Last activity            | Yes                      | Bulk tag                      | CSV                                |
| Projects                                                            | Name, Client, Phase, Health status, Deadline       | Phase, Status, Owner                    | Deadline, Created              | Yes                      | None needed at 5-person scale | Not needed V1                      |
| Tasks                                                               | Title, Project, Assignee, Due, Priority            | Assignee=me (default!), Status, Project | Due date                       | Yes ("My tasks" default) | Bulk status/assignee change   | Not needed                         |
| Invoices                                                            | Number, Client, Amount, Status, Due date           | Status, Overdue, Date range             | Due date, Amount               | Yes                      | Bulk send reminder            | CSV (needed — accountant will ask) |

Don't build: export on Tasks/Projects (nobody's exporting a task list, that's what the UI is for), bulk actions on Companies beyond tagging (bulk-editing company records is a rare, high-risk action — keep it single-record). Pagination: cursor-based on all tables expected to exceed a few hundred rows (Contacts, Activities, Documents), offset pagination is fine and simpler for small tables (Companies, Deals, Projects) at your scale.

---

## 9. Auditability — A/B/C

**A. Must audit** (Tier A — immutable, includes before/after JSON, actor, timestamp, IP where the action is security-sensitive):

- All Invoice/Payment/Refund/CreditNote/ForgeFundEntry state changes
- Deal stage changes (all of them — this is core reporting data)
- Proposal status changes
- Role/permission changes on any User
- Client portal access grant/revoke
- Document deletion (soft-delete event)
- Failed login attempts on portal (security monitoring, not business audit — but same table, different retention policy)
- Project phase transitions, Project status changes, Handover completion

**B. Useful to audit** (Tier B — logged, but lighter retention, no IP/device needed):

- Milestone completion (non-approval-gated ones)
- Task reassignment
- Note visibility changes (internal → client\_visible is worth tracking, it's a potential leak point)
- MaintenanceContract renewal

**C. Don't audit:**

- Task status routine progression (To Do → In Progress → Done)
- Comment edits
- Search queries
- Dashboard views
- Minor field edits (description text changes) on non-financial, non-contractual entities

**Audit log protection:** `AuditLog` table has no `UPDATE`/`DELETE` grant at the Postgres role level for the application's DB user — enforced at the database, not just "the API doesn't expose an edit endpoint." Application-layer-only protection on an audit log is not real protection.

---

## 10. Document / File Security

- **Upload:** direct-to-R2 via presigned upload URL (don't proxy file bytes through your NestJS server — wastes bandwidth/memory at any real file size), size-limited (e.g. 25MB default, configurable), MIME-type allowlist enforced both client-side (UX) and server-side (real check, via content-sniffing not just extension).
- **Storage:** R2, path convention `org/{company_id}/{entity_type}/{entity_id}/{uuid}-{filename}` — never trust client-supplied filenames for the storage path itself (sanitize/replace).
- **Metadata:** DB row holds `filename, size, mime_type, category, visibility, uploaded_by, entity ref` — R2 holds bytes only.
- **Permissions/visibility:** inherited from parent entity + explicit `visibility` flag (§1 of v1 spec, unchanged, correct).
- **Versioning:** only for Proposal/Contract/Invoice-type documents (already generated internally with real version semantics) — arbitrary uploaded files get replace-with-audit-log, not full version history (not worth the complexity for a client-uploaded logo file, say).
- **Download:** always via short-lived signed URL, never direct bucket URL.
- **Deletion:** soft delete (`deleted_at`), object retained in R2 for a retention window (e.g. 90 days) before actual purge — protects against accidental deletion of a client contract.
- **Virus/malware scanning:** explicitly **not built in V1** — real infra cost (ClamAV worker or a paid scanning API) for a 5-person internal tool with a small, mostly-known set of uploaders (your own team + known clients). Mitigate with MIME allowlist + size limits + never-executable content-disposition instead. Revisit if you ever open uploads to fully anonymous/public users.
- **When a client loses portal access:** `ClientUser.active = false` immediately blocks all new signed-URL generation and session validity (§6) — already-downloaded files on the client's machine are out of your control by definition, that's not solvable at this layer and shouldn't be treated as a bug.

---

## 11. Notification Architecture

```
event → notification rule → recipient resolution → delivery channel → retry → failure handling

```

| Event Recipients Channels Batching  |                                            |                                                    |                                                             |
| ----------------------------------- | ------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| Task assigned/due                   | Assignee                                   | In-app + email digest (not instant email per task) | Daily digest for due-soon, instant in-app only              |
| Deal follow-up due                  | Owner                                      | In-app, instant                                    | None                                                        |
| Invoice overdue                     | Internal (owner) + Client                  | In-app+email (internal), email (client)            | Client: escalating cadence (3/7/14 days), not daily nagging |
| Proposal viewed                     | Deal owner                                 | In-app instant                                     | None (low-volume, high-value signal)                        |
| Payment received                    | Internal (finance role) + Client (receipt) | Email both                                         | None                                                        |
| Maintenance expiring                | Account owner                              | In-app + email, 30/7 day warnings                  | None                                                        |

**Delivery/retry:** email via Resend, queued job with exponential backoff (3 retries), failure after that logs to an internal "delivery failures" view — don't silently drop, don't infinite-retry either. In-app notifications are DB rows, no delivery failure mode by definition, just "unread."

**Spam avoidance rule:** any notification type that could fire more than once per entity per day gets batched/digested; anything inherently rare and high-signal (Deal Won, Proposal Accepted, Payment Received) fires instantly, unbatched.

---

## 12. Automation / Event Architecture

| Event Producer Consumers Sync/Async Idempotency key Retry  |                                                               |                                                        |                                                                                          |                                             |                                                                    |
| ---------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| `DealWon`                                                  | CRM module                                                    | Projects (create+template), Notifications              | Async (outbox, §3)                                                                       | `deal_id`                                   | Yes, at-least-once, consumer checks before acting                  |
| `ProposalSent`                                             | Sales module                                                  | Notifications, Activity logger                         | Async                                                                                    | `proposal_id + version`                     | Yes                                                                |
| `ProposalAccepted`                                         | Sales module (from portal action)                             | CRM (Deal eligibility flag), Notifications             | Async                                                                                    | `proposal_id`                               | Yes                                                                |
| `InvoiceCreated`                                           | Finance module                                                | Notifications                                          | Async                                                                                    | `invoice_id`                                | Yes                                                                |
| `PaymentReceived`                                          | Finance module (webhook handler)                              | Invoice updater, ForgeFund, Notifications              | **Sync for Invoice+ForgeFund update** (same transaction, §3), **async for notification** | `razorpay_payment_id`                       | Notification: yes; core update: exactly-once via unique constraint |
| `PaymentOverdue`                                           | Finance module (cron-detected, not event-driven from a write) | Notifications                                          | Async, scheduled                                                                         | `invoice_id + date` (one alert per day max) | N/A, idempotent by construction                                    |
| `ProjectPhaseChanged`                                      | Projects module                                               | Notifications (if client-visible phase), Client Portal | Async                                                                                    | `project_id + phase`                        | Yes                                                                |
| `MilestoneCompleted`                                       | Projects module                                               | Notifications (if client-visible)                      | Async                                                                                    | `milestone_id`                              | Yes                                                                |
| `MaintenanceExpiring`                                      | Finance/Projects module, cron-detected                        | Notifications                                          | Async, scheduled                                                                         | `contract_id + threshold_day`               | N/A                                                                |

No generic rules engine — this fixed table of \~9 events, each with a hard-coded consumer list, is the entire "automation system" for V1. Confirmed correct from v1, unchanged.

---

## 13. API Architecture

**Module boundaries and forbidden dependencies:**

| Module Owns Can depend on Forbidden  |                                                                        |                                                                                                                                                   |                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth`                               | User, Role, Session, InvitationToken                                   | nothing                                                                                                                                           | must not depend on any domain module                                                                                                                                                                                                                                                                              |
| `crm`                                | Company, Contact, Lead, Deal                                           | `shared`, `auth` (read-only)                                                                                                                      | must not import from `finance` or `projects` directly                                                                                                                                                                                                                                                             |
| `sales`                              | Proposal, ProposalLineItem                                             | `crm` (read Deal), `shared`                                                                                                                       | must not import `finance`                                                                                                                                                                                                                                                                                         |
| `projects`                           | Project, Milestone, Task, TimeEntry                                    | `crm` (read Deal/Company), `sales` (read accepted Proposal), `shared`                                                                             | must not import `finance`                                                                                                                                                                                                                                                                                         |
| `finance`                            | Invoice, Payment, Refund, CreditNote, Expense, ForgeFundEntry          | `projects` (read Project for invoice context), `crm` (read Company for billing details), `shared`                                                 | must not import `sales` directly — gets proposal data only via the snapshot already copied onto Invoice at creation, reinforcing the §1 snapshot decision architecturally                                                                                                                                         |
| `team`                               | User payouts, workload views                                           | `projects`, `finance` (read-only)                                                                                                                 | —                                                                                                                                                                                                                                                                                                                 |
| `portal`                             | ClientUser, portal-scoped read models                                  | reads from `crm`/`projects`/`finance`/`sales` via **read-only query services**, never direct entity mutation except the narrow accept/pay actions | must never expose internal-module write methods directly                                                                                                                                                                                                                                                          |
| `shared`                             | Activity, Note, Document, Notification, AuditLog, DomainEvent (outbox) | nothing domain-specific                                                                                                                           | imported by everyone, imports no one — this is the dependency-graph leaf, and the rule that actually prevents circularity: **shared has zero domain dependencies, every domain module may depend on shared, domain modules never depend on each other except in the explicit read-only directions in this table** |

**REST conventions:** plural nouns, standard verbs, `PATCH` for partial updates never `PUT` for domain entities with computed/derived fields. **Pagination:** cursor-based for high-growth tables (Activity, Task, Document, Contact per §15), offset for small ones. **Filtering:** query params matching indexed columns only (`?stage=won&owner=uuid`), don't expose arbitrary filter DSL. **Validation:** `class-validator` DTOs on every mutating endpoint, reject unknown fields (`forbidNonWhitelisted`). **Error format:** consistent envelope (`{ error: { code, message, details } }`), stable machine-readable `code` for frontend branching, not string-matching messages. **Versioning:** URL-prefixed (`/api/v1/...`) from day one — costs nothing now, saves a painful migration later. **Idempotency:** `Idempotency-Key` header support on POST endpoints that create financial records (Invoice, Payment recording) — client (or retry logic) can safely resend. **Rate limiting:** per-user token bucket on all endpoints, stricter on `auth` and `portal`.

---

## 14. Database / Prisma

- **UUIDs** (v4) as PK everywhere — already decided, confirmed correct, required for the IDOR mitigation in §5.
- **Timestamps:** `created_at`/`updated_at` on every table (Prisma `@updatedAt`), plus entity-specific ones (`sent_at`, `paid_at`, `completed_at`) — don't derive "when was this sent" from `AuditLog` alone, denormalize the key timestamp onto the entity for cheap querying.
- **Enums:** Postgres native enums for fixed sets (Deal stage, Invoice status) — not free-text with app-level validation, you want the DB to reject garbage.
- **Unique constraints:** listed in §1 — `invoice_number` (scoped per FY), gateway IDs, webhook event IDs, `(deal_id, version)` on Proposal.
- **Indexes:** every FK column (Prisma doesn't auto-index these on Postgres the way some ORMs imply — verify explicitly), plus `Deal.stage`, `Project.status`, `Invoice.status`, `Task.assignee_id + status` (composite, for "my open tasks" — your single most-run query), full-text GIN index for search (§10 of v1 spec, confirmed).
- **Nullable fields:** `Project.deal_id`, `Contact.company_id`, `Invoice.project_id` (nullable per §1 decision), `Milestone.approved_at` — nullable is correct where the relationship is genuinely optional, not used as a lazy way to avoid a decision.
- **JSONB metadata:** one `metadata: Json?` column per major entity for genuine one-offs, plus `Project.handover_checklist` as JSONB (per §1 correction above) — don't let JSONB become a dumping ground for fields that should be real columns once you see 2+ entities needing the same "custom" field (that's the signal to promote it to a column, not build a custom-fields system).
- **Cascading deletes:** `ON DELETE RESTRICT` on all FKs from Invoice/Payment/Deal/Project back to Company/Contact — never `CASCADE` on anything touching financial or historical records (§1). `CASCADE` acceptable only for genuinely dependent child rows with no independent value (e.g. `TaskComment` when `Task` is hard-deleted from a still-Draft, never-shipped item).
- **Soft deletes:** `deleted_at: DateTime?` on Company/Contact/Deal/Project/Invoice/Payment/Document, all default queries filtered via a Prisma middleware (`where: { deleted_at: null }` injected automatically) so nobody has to remember to add it per-query — forgetting this once is how a "deleted" client's data reappears somewhere.
- **Optimistic locking:** add a `version: Int` column (incrementing) on Invoice and Payment specifically — concurrent edits to financial records (rare but possible, e.g. two staff editing a Draft invoice) should fail loudly on conflict, not silent-overwrite. Not needed elsewhere at this team size.
- **Transaction boundaries:** as specified in §3 — DB transaction scope is "atomic business fact," never spans external I/O.

**Fastest-growing tables, index accordingly:** `Activity`, `Task`, `Document`, `Note` — these grow with every day of usage across every entity. Index `(entity_type_fk, created_at desc)` pattern on each for the "timeline for this entity" query, which is the highest-frequency read in the whole system.

---

## 15. Performance

At the stated scale (100k activities, 50k tasks, 20k documents, 10k companies, 50k contacts) — **this is small for Postgres.** A single well-indexed instance (even a modest managed Postgres, 2-4 vCPU) handles this comfortably. Do not add Redis/Elasticsearch/Kafka at this volume — there is no concrete bottleneck these numbers would create.

**Real risks at this scale, and fixes (all within Postgres):**

- **N+1 on entity detail pages** — fetching a Project then separately querying Activities, Notes, Documents, Tasks one-by-one per related entity. Fix: Prisma `include`/batched queries, or a single `UNION ALL` for the unified timeline (§1 of v1 spec) instead of 3 separate round trips merged in app code.
- **Dashboard aggregate queries** — `COUNT`/`SUM` across the full Deal/Invoice tables on every dashboard load, run per-request, gets slow as rows grow into the tens of thousands with concurrent users. Fix: not needed at launch, but plan for a periodically-refreshed summary table (materialized view or a cron-updated `DashboardSnapshot` row, refreshed every few minutes) once you notice dashboard load time creeping — don't build this speculatively in V1, but don't architect the dashboard query in a way that makes adding it later hard (keep dashboard aggregation in one service method, not scattered inline queries).
- **Timeline queries** — addressed above via composite index + UNION query.
- **Search** — PostgreSQL FTS with GIN index (v1 spec, confirmed) is entirely sufficient at these volumes; revisit only past \~500k-1M rows in a single searched table, which is years away at your growth rate.
- **Pagination strategy** — cursor-based (`created_at` + `id` compound cursor) on Activity/Task/Document/Contact specifically, since these are the tables that'll actually reach thousands of rows per parent entity over time; offset pagination remains fine everywhere else.

---

## 16. Backup / Disaster Recovery

Realistic for a 5-person studio, not enterprise theater:

- **Backup frequency:** daily automated full backup (managed Postgres provider default — Supabase/Railway/RDS all do this), plus point-in-time recovery (WAL-based) if the provider supports it (most do at low extra cost) — gives you sub-daily recovery granularity without building anything custom.
- **Retention:** 30 days rolling, monthly snapshot retained 12 months (covers "we need last year's invoice for tax filing" scenarios).
- **Restore procedure:** documented 1-pager — provider's restore-to-new-instance flow, repoint `DATABASE_URL`, verify row counts on key tables, done. **Test this once, for real, now** — an untested backup is a hypothesis, not a plan.
- **RPO (data loss tolerance):** ≤24h via daily backup, effectively near-zero with PITR — state which one you actually have once you pick a provider.
- **RTO (downtime tolerance):** a few hours is realistic and acceptable at this scale — don't over-invest in hot-standby infrastructure for an internal tool with no 24/7 SLA obligations.
- **Document recovery:** R2 has its own versioning/retention — enable bucket versioning, gives you file-level recovery independent of the DB backup cycle.
- **Secret recovery:** secrets (Razorpay keys, DB creds, JWT signing keys) live in your hosting provider's secret manager, not in a `.env` committed anywhere — recovery is "redeploy from the same secret store," not a special procedure, but write down *where the secret store is and who has access* — that's the actual recovery risk (bus factor on a 5-person team), not the technical mechanism.
- **Incident procedure:** 1-pager — who gets notified, where status is communicated (even just a shared doc), rollback steps for a bad deploy. Doesn't need to be more than this at your size.

---

## 17. Observability

Lightweight stack, no enterprise tooling needed:

- **API errors + performance:** Sentry (or similar) on the NestJS backend — free/cheap tier covers a 5-person internal tool's error volume easily.
- **Auth failures:** log + alert on repeated failed logins (feeds the rate-limiting/brute-force mitigation in §5) — a simple threshold alert, not a SIEM.
- **Payment webhook failures:** critical-path alert (Slack/email webhook) on any `WebhookEvent` that fails processing after retries — this one genuinely needs to page a human, it's money.
- **Background job failures:** whatever job queue you pick (BullMQ on Redis is reasonable here — this is the one place a lightweight Redis instance earns its keep, for job queuing, not caching/sessions) should have a failed-job dashboard, checked or alerted on.
- **Database errors:** provider-level monitoring (connection pool exhaustion, slow query log) — most managed Postgres providers expose this out of the box, just turn it on.
- **Storage errors:** R2 upload/download failures logged at the application layer where they occur (upload endpoint, signed-URL generation).
- **Email delivery failures:** Resend provides delivery webhooks — log bounces/failures, surface in the "delivery failures" view mentioned in §11.
- **Client portal errors:** same Sentry instance, tagged separately (`portal` vs `internal`) so you can tell if a portal-specific bug is affecting clients versus your own team.

Recommended stack: **Sentry + your hosting provider's built-in DB/infra monitoring + BullMQ dashboard.** No ELK, no Datadog, no custom metrics pipeline — genuinely unnecessary at this scale and team size.

---

## 18. India / GST / Business Reality

**Must support now (this was underspecified in v1 — flagging the gap):**

- `GSTIN` on Organization and Company (nullable on Company — not every client is GST-registered)
- CGST/SGST/IGST computed from `TaxRate` lookup (§1) based on Organization's state vs Company's billing state (intra-state = CGST+SGST split, inter-state = IGST) — this branching logic must be correct, it's the actual GST compliance requirement, not just "add a tax\_rate %"
- HSN/SAC codes on Invoice line items (services generally use SAC — e.g. 998314 for IT design/development services — verify actual applicable codes with an accountant, don't guess)
- **Invoice numbering: sequential, no gaps, reset (or continued, per your registration) per financial year** — this is a genuine legal requirement under GST rules, and v1 didn't address it. This cannot be a UUID or a naive `id++` — it needs an atomic sequence generator scoped to financial year (`FY2025-26/INV/0001`), implemented as a dedicated counter table with a transactional increment, separate from the entity's internal UUID primary key.
- Billing address (state is the compliance-critical field, for the CGST/SGST vs IGST branch above) on both Organization and Company.
- Payment reference numbers stored against Payment (bank ref / UPI ref / Razorpay ID) for reconciliation with your accountant's books.

**Explicitly do NOT build in V1:**

- E-invoicing / IRN generation via the GST e-invoice portal (only mandatory above a turnover threshold — check current threshold with your accountant, don't build against a regulation you may not yet be subject to)
- Multi-currency/forex conversion logic (§16 of v1 spec, confirmed — defer until a real non-INR client)
- TDS (tax deducted at source) tracking on the Expense side — relevant once you have larger vendor payments, not day one
- Automated GSTR filing integration — that's an accounting-software problem, not a CRM problem; export clean data for your accountant, don't try to become Tally

---

## 19. Future Scale

The `organization_id`-column-now-unenforced-later decision (v1, §15) is correct. Refinement:

**Implement now:**

- `organization_id` column on every table, defaulted to your single org's ID, **not nullable** — a nullable "we'll fill it in later" column is worse than a defaulted one, because defaulted means every future query can already include the filter with zero rows breaking.
- Keep the column even though no query currently needs to filter by it — the cost is one column, the benefit is the migration becomes "start enforcing" instead of "add + backfill + enforce."

**Deliberately defer:**

- Any actual tenant-isolation middleware/guard
- Per-org billing/subscription logic
- Org-scoped role/permission boundaries (right now Role is global to your one org, fine)

**What would make future multi-tenancy genuinely hard if done wrong now:** any unique constraint that isn't scoped by `organization_id` from the start. E.g. if `Invoice.invoice_number` gets a bare global unique constraint instead of `unique(organization_id, financial_year, invoice_number)`, adding a second org later means two orgs can't both have an "INV/0001" — a real migration headache. **Scope every uniqueness constraint by** **`organization_id`** **now**, even with one org, so the constraint never needs to change shape later.

**Schema decisions that must be correct from day one:** the `organization_id` column's presence and scoped uniqueness constraints (above) — everything else (adding actual isolation guards, per-org settings, billing) is additive later work, not a schema rewrite.

---

## 20. Product Simplicity Test

| Feature Classification Note                                  |                  |                                                                                                 |
| ------------------------------------------------------------ | ---------------- | ----------------------------------------------------------------------------------------------- |
| Lead/Deal separation                                         | MUST HAVE        | Core pipeline integrity                                                                         |
| Proposal versioning + snapshot                               | MUST HAVE        | Financial/legal correctness                                                                     |
| Project templates                                            | MUST HAVE        | The actual automation payoff                                                                    |
| Forge Fund ledger                                            | MUST HAVE        | You explicitly required correct modeling                                                        |
| Client portal (read-only + pay/accept)                       | MUST HAVE        | Stated goal                                                                                     |
| GST-correct invoicing                                        | MUST HAVE        | Legal requirement, not optional                                                                 |
| Webhook idempotency + reconciliation                         | MUST HAVE        | Money correctness, non-negotiable                                                               |
| Audit logging (Tier A)                                       | MUST HAVE        | Financial/security requirement                                                                  |
| Command palette                                              | SHOULD HAVE      | High leverage for daily 8h use, cheap to build once nav exists                                  |
| Saved table views                                            | SHOULD HAVE      | Real daily-use friction reducer                                                                 |
| CreditNote entity                                            | SHOULD HAVE      | GST correction compliance — not urgent day one but before your first invoice correction happens |
| Handover checklist                                           | SHOULD HAVE      | As JSONB, not relational — cheap either way                                                     |
| Lead source reporting                                        | SHOULD HAVE      | You already collect the field, make it useful                                                   |
| Support tickets                                              | NICE TO HAVE     | Phase 8, real but not urgent                                                                    |
| Maintenance contracts                                        | NICE TO HAVE     | Phase 8, needed once you have post-handover clients, not before                                 |
| Bulk actions (beyond Deal owner reassign, Invoice reminders) | NICE TO HAVE     | Low frequency at 5-person scale                                                                 |
| Antivirus scanning on uploads                                | DO NOT BUILD YET | Real infra cost, low current risk profile (§10)                                                 |
| Custom fields system                                         | DO NOT BUILD YET | Confirmed from v1 — still correct                                                               |
| Generic automation rules engine                              | DO NOT BUILD YET | Confirmed from v1 — the fixed event table (§12) covers real needs                               |
| Multi-currency                                               | DO NOT BUILD YET | Confirmed from v1                                                                               |
| WhatsApp Business API integration                            | DO NOT BUILD YET | Confirmed from v1                                                                               |
| E-invoicing/IRN                                              | DO NOT BUILD YET | Threshold-dependent, verify with accountant first                                               |
| Elasticsearch/Redis-for-search/Kafka                         | DO NOT BUILD YET | No bottleneck exists at any realistic near-term volume (§15)                                    |
| Lead scoring                                                 | DO NOT BUILD YET | Confirmed from v1                                                                               |
| Multi-tenancy enforcement                                    | DO NOT BUILD YET | Column exists (§19), enforcement is real future work                                            |

---

# Final Output

## A. Critical architectural flaws found

1. Invoice/Proposal line items specified as live references to mutable data instead of immutable snapshots — real compliance and correctness bug.
2. No webhook signature verification specified — direct "fake a payment" attack surface.
3. No `WebhookEvent`/idempotency table — payment webhook replay could double-process.
4. Invoice numbering not specified as a legally-required gapless sequence per financial year.
5. Client portal access-revocation had no concrete mechanism (session could outlive an intended revoke).
6. `paid_amount` specified as pure derive-on-read with no caching strategy, would become a real dashboard performance problem at moderate scale.

## B. Medium-risk issues

- No `CreditNote` entity for GST-compliant corrections.
- Polymorphic Activity/Note/Document lacked a DB-level exactly-one-FK constraint.
- Cascading delete behavior from Company → Invoice/Payment wasn't explicitly forbidden (risk of accidental financial data loss via CASCADE misconfiguration).
- Object-level authorization pattern for the portal wasn't specified as a shared guard — left as an implicit "remember to check" risk.
- No reconciliation job specified between Razorpay and internal Payment records.

## C. Minor improvements

- Split Project `handover_checklist` from a relational table to JSONB — right-sized for the data shape.
- Optimistic locking (`version` column) on Invoice/Payment for concurrent-edit safety.
- API versioning (`/api/v1`) and idempotency-key support on financial POST endpoints.
- Dashboard aggregation isolated into a single service layer now, so a future cached-summary-table optimization doesn't require a rewrite.

## D. Features we should remove (from the original plan / v1 elaboration)

- Standalone "Account" concept (undefined, unnecessary — nullable FKs on Invoice cover it).
- Relational `HandoverChecklist`/`ChecklistItem` tables → JSONB instead.
- Any implied per-module custom dashboard beyond the single unified Dashboard.

## E. Features we should add

- `CreditNote`, `WebhookEvent`, `InvitationToken`, `TaxRate` entities.
- Razorpay webhook signature verification.
- Nightly Razorpay ↔ Payment reconciliation job.
- FY-scoped atomic invoice numbering sequence.
- `PortalScopeGuard` as an architectural (not per-handler) enforcement point.
- `ClientUser.active` flag checked per-request, not just session expiry.

## F. Database changes required

- Invoice/Proposal line items: snapshot columns, not live FKs.
- `Invoice.paid_amount`: cached column + reconciliation job, not pure derive-on-read.
- Unique constraints: `invoice_number` scoped `(organization_id, financial_year)`, `razorpay_payment_id`, `razorpay_event_id`, `(deal_id, version)` on Proposal, `(source_ref, type)` on ForgeFundEntry.
- `organization_id` non-nullable, defaulted, on every table; all uniqueness constraints scoped by it.
- Soft delete (`deleted_at`) enforced via Prisma middleware, not per-query discipline.
- `ON DELETE RESTRICT` (never CASCADE) from Invoice/Payment/Deal/Project back to Company/Contact.
- `version: Int` optimistic lock on Invoice, Payment.
- CHECK constraint on polymorphic tables enforcing exactly-one-parent-FK.

## G. Security changes required

- Webhook signature verification (Razorpay HMAC) before any DB write.
- Separate cookie/session namespace and JWT audience for portal vs internal users.
- `PortalScopeGuard` applied at module level, not per-controller.
- CSRF protection on portal state-changing actions.
- `ClientUser.active` checked per-request for sensitive actions.
- Audit log table with no UPDATE/DELETE grant at the DB role level.
- Rate limiting on auth + portal login specifically, with account lockout.

## H. Workflow changes required

- Deal `Won` transition blocked at API level unless an Accepted Proposal exists.
- Project `completed` blocked unless handover checklist fully checked.
- Invoice editing locked after first payment — corrections via CreditNote only.
- "Generate Invoice from Proposal" as a one-click pre-fill action, not manual re-entry.
- DealWon cascade implemented as transactional-outbox (core fact committed synchronously, downstream automation async + idempotent + independently retryable).

## I. Final recommended module architecture

`auth`, `crm`, `sales`, `projects`, `finance`, `team`, `portal`, `shared` — dependency rules as specified in §13, with `shared` as the zero-dependency leaf and `finance` never importing `sales` directly (gets data via the Invoice snapshot, not a live join). Unchanged from v1 in shape, tightened in the forbidden-dependency rules.

## J. Final recommended entity graph

As in v1 §19, plus: `CreditNote`, `Refund` (promoted to first-class, was implied), `WebhookEvent`, `InvitationToken`, `TaxRate`, `DomainEvent` (outbox table for §3's transactional pattern). `HandoverChecklist` removed as a relational entity (now JSONB field on Project). Proposal and Invoice line items are snapshot value objects, not FK-referenced rows once finalized.

## K. Final implementation phases

Unchanged in structure from v1 §18, with these additions pulled forward:

- **Phase 0** now explicitly includes: `DomainEvent` outbox table, `WebhookEvent` table, `organization_id` scoping on every table, Prisma soft-delete middleware — these are foundational, not deferrable to later phases.
- **Phase 2** (Sales & Proposals) now explicitly includes: proposal versioning as immutable rows from day one, not retrofitted.
- **Phase 4** (Finance) now explicitly includes: webhook signature verification, `WebhookEvent`-based idempotency, FY-scoped invoice numbering, nightly reconciliation job, `CreditNote` entity, cached `paid_amount` — these were previously implied but not called out as Phase 4 deliverables; they are the actual hard part of Phase 4 and should not be treated as follow-on polish.
- **Phase 5** (Client Portal) now explicitly includes: `PortalScopeGuard`, separate session/JWT namespace, `ClientUser.active` enforcement, CSRF protection — these are Phase 5 launch blockers, not hardening to do later.

---

# FORGE BUSINESS OS — ARCHITECTURE FREEZE CANDIDATE

This version — v1 architecture + every correction in sections A–K above — is the one to hand to an engineering team. Summary of what changed and why it matters, for anyone picking this up fresh:

1. **Financial documents (Invoice/Proposal line items) are immutable snapshots, not live references.** Editing a Company or Proposal later must never silently alter a historical financial record.
2. **Forge Fund and all financial balances are ledger-derived and reconciled, not trusted as pure application state.** A nightly job against Razorpay is the real source-of-truth check.
3. **Every financial mutation path is idempotent by a DB constraint, not application discipline** — webhook replay, retried requests, and concurrent edits cannot corrupt money.
4. **Authorization for the client portal is enforced structurally** (a shared guard, query-layer scoping, separate session namespace) rather than relying on per-endpoint diligence.
5. **GST compliance (sequential invoice numbering, CGST/SGST/IGST branching, HSN/SAC) is a Phase 4 requirement, not a later nice-to-have** — it's a legal constraint on the finance module, treated with the same seriousness as payment correctness.
6. **Nothing has been added that the Product Simplicity Test (§20) didn't justify** — the entity/feature additions in this review exist because they close a real correctness or compliance gap found by red-teaming, not because they're "what a professional CRM has."

Proceed to schema definition and NestJS module scaffolding against this spec. Still no implementation code — that's the next step, not this one.