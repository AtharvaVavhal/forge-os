# FORGE Business OS — Backend + API Specification

**Document 5** — Implementation-ready NestJS backend and REST API contract.

| Status | Frozen |
| --- | --- |
| Depends on | Documents 1–4 (Architecture, Database Spec, Prisma Schema, Migration + Seed) |
| Conflict resolutions | Invoice/Payment/Project soft-delete; CreditNoteSequence; RBAC = frozen `UserRole`; Forge Fund = `ForgeFundEntry` only |
| Implementation | **Not started** — this document is specification only |

**Non-goals:** NestJS code, dependency installs, schema changes, marketing website (`/Users/atharva/Forge`).

---

## 1. Module boundaries

| Module | Owns | May depend on | Must not |
| --- | --- | --- | --- |
| `auth` | User, Session, InvitationToken, Google Workspace SSO | — | Depend on any domain module |
| `crm` | Company, Contact, Lead, Deal | `shared`, `auth` (read-only) | Import `finance` or `projects` |
| `sales` | Proposal, ProposalLineItem | `crm` (read Deal), `shared` | Import `finance` |
| `projects` | Project, Milestone, Task, TimeEntry | `crm` (read), `sales` (read accepted Proposal), `shared` | Import `finance` |
| `finance` | Invoice, Payment, Refund, CreditNote, Expense, ForgeFundEntry, InvoiceSequence, CreditNoteSequence, TaxRate, WebhookEvent | `projects` (read), `crm` (read Company), `shared` | Import `sales` (use invoice snapshots only) |
| `team` | Workload views; read/filter of Forge Fund entries relevant to members | `projects` (read), `finance` (read ForgeFundEntry / Payment context) | Own separate payout tables (none exist) |
| `portal` | ClientUser sessions; portal read models; accept proposal; pay invoice | Read-only query services from `crm`/`sales`/`projects`/`finance`; narrow mutations only | Expose internal write services |
| `shared` | Activity, Note, Document, Notification, AuditLog, DomainEvent | Nothing domain-specific | Be imported *from* by everyone; import no domain modules |

NestJS package layout (future): `src/modules/{auth,crm,sales,projects,finance,team,portal,shared}/`.

---

## 2. API base conventions

### 2.1 Base path

```
/api/v1
```

Portal surface (separate cookie/JWT audience):

```
/api/v1/portal
```

Razorpay webhook (no session; HMAC only):

```
/api/v1/webhooks/razorpay
```

### 2.2 HTTP verbs

| Verb | Use |
| --- | --- |
| `GET` | Read one or list |
| `POST` | Create; state transitions that are commands (`/transition`, `/accept`, `/send`) |
| `PATCH` | Partial update of mutable fields only — **never** arbitrary status/stage patches that bypass state machines |
| `DELETE` | Only where hard-delete is allowed by Doc 2 (e.g. unused draft notifications). Soft-archive via `POST .../archive` or `PATCH` setting `archived_at` / `deleted_at` |

**Forbidden:** `PUT` for domain entities with derived fields.

### 2.3 Plural nouns

Examples: `/companies`, `/contacts`, `/leads`, `/deals`, `/proposals`, `/projects`, `/milestones`, `/tasks`, `/time-entries`, `/invoices`, `/payments`, `/refunds`, `/credit-notes`, `/expenses`, `/forge-fund-entries`, `/activities`, `/notes`, `/documents`, `/notifications`, `/audit-logs`, `/invitations`.

### 2.4 Pagination

| Table class | Strategy | Params |
| --- | --- | --- |
| High-growth: Activity, Task, Document, Contact, Note, AuditLog, DomainEvent, WebhookEvent | Cursor | `cursor`, `limit` (default 25, max 100) |
| Small: Company, Deal, Project, Proposal, Invoice, Lead | Offset | `page` (1-based), `pageSize` (default 25, max 100) |

List response envelope:

```json
{
  "data": [],
  "meta": {
    "pagination": {
      "mode": "cursor|offset",
      "limit": 25,
      "nextCursor": "…",
      "page": 1,
      "pageSize": 25,
      "total": 0
    }
  }
}
```

(`total` optional for cursor mode.)

### 2.5 Filtering / sorting / search

- Filters: query params on **indexed** columns only (e.g. `?stage=WON&ownerId=`). No arbitrary filter DSL.
- Sort: `?sort=createdAt:desc` whitelist per resource.
- Search: `GET /api/v1/search?q=` uses Postgres FTS (Doc 2 GIN indexes). Entity-scoped search via `?q=` on list endpoints where indexed.

### 2.6 Validation

- `class-validator` + `ValidationPipe({ whitelist: true, forbidNonWhitelisted: true })`.
- UUID path/query params validated as UUID.
- Money: decimal strings matching `Decimal(12,2)` (reject float JSON numbers for money fields in DTOs — accept string `"12000.00"`).
- Enums: Prisma/Postgres enums only.
- Dates: ISO-8601; date-only fields as `YYYY-MM-DD`.

### 2.7 Idempotency

Header: `Idempotency-Key: <client-uuid>` required on:

- `POST /invoices` (create draft / from proposal)
- `POST /invoices/:id/send`
- `POST /payments` (manual/offline)
- `POST /refunds`
- `POST /credit-notes`
- `POST /forge-fund-entries`
- `POST /webhooks/razorpay` (additionally gated by `WebhookEvent` unique)

Store key → response for 24h scoped to `(organization_id, user_id, route)`.

### 2.8 Errors

```json
{
  "error": {
    "code": "DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL",
    "message": "Deal cannot move to WON without an accepted proposal.",
    "details": { "dealId": "…" },
    "requestId": "…"
  }
}
```

| HTTP | When |
| --- | --- |
| 400 | Validation / malformed |
| 401 | Unauthenticated |
| 403 | Authenticated but forbidden |
| 404 | Not found **in caller scope** (no existence leak across orgs/companies) |
| 409 | Conflict (optimistic lock, unique, illegal state transition) |
| 422 | Semantic business rule failure |
| 429 | Rate limit |
| 500 | Unexpected (no stack/secrets) |

### 2.9 Auth transport

| Surface | Mechanism |
| --- | --- |
| Internal | `forge_session` httpOnly cookie; JWT `aud: internal` |
| Portal | `portal_session` httpOnly cookie; JWT `aud: portal` |
| CSRF | Required on cookie-authenticated state-changing portal routes (`SameSite=Strict` + CSRF token) |

Internal and portal tokens **must not** validate against each other’s guards.

---

## 3. Auth module

### 3.1 Identity model

- Internal: `User` + `UserRole` (`FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER`).
- Portal: `ClientUser` (separate; `active` checked every sensitive request).
- Google Workspace SSO is the internal SSO provider (nullable `password_hash` when SSO-only). Do not add other IdPs in V1.
- Password login may exist for break-glass / non-SSO users; rate-limited.

### 3.2 Endpoints (internal)

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/v1/auth/login` | Email/password login (if enabled) |
| `POST` | `/api/v1/auth/logout` | Invalidate session |
| `GET` | `/api/v1/auth/session` | Current session |
| `GET` | `/api/v1/auth/me` | Current `User` + role + permissions |
| `GET` | `/api/v1/auth/permissions` | Effective permission list for current user |
| `GET` | `/api/v1/auth/google/start` | Start Google Workspace OAuth |
| `GET` | `/api/v1/auth/google/callback` | OAuth callback → session |
| `POST` | `/api/v1/invitations` | Create team or client invitation |
| `GET` | `/api/v1/invitations/:id` | Invitation metadata (internal) |
| `POST` | `/api/v1/invitations/:id/revoke` | Set `revoked_at` |
| `POST` | `/api/v1/invitations/accept` | Accept with raw token (hash lookup); single-use |

Invitation rules (Doc 2): store `token_hash` only; `expires_at`; `used_at` on first use; `scope` `TEAM|CLIENT`; TEAM sets `user_role`; CLIENT sets `company_id`.

Password reset (if password auth enabled): single-use token, 15–30 min TTL, invalidate sessions on password change — standard security from Doc 1 §5; endpoints `POST /auth/password-reset/request`, `POST /auth/password-reset/confirm`.

---

## 4. RBAC (frozen roles only)

### 4.1 Roles

| Role | Intent |
| --- | --- |
| `FOUNDER_ADMIN` | Full internal access; role changes; org settings |
| `OPERATIONS` | Delivery: projects, tasks, milestones, handover |
| `FINANCE` | Invoices, payments, refunds, credit notes, expenses, Forge Fund |
| `SALES` | CRM pipeline, proposals |
| `TEAM_MEMBER` | Assigned work, own time entries, limited reads |

Portal: **`ClientUser` only** — not a `UserRole`. Authorized via `PortalScopeGuard` + `company_id` + `active`.

### 4.2 Permission catalog

Format: `resource.action`.

| Permission | Meaning |
| --- | --- |
| `users.read` / `users.manage` | List users / invite & deactivate / change role |
| `crm.read` / `crm.manage` | Companies, contacts, leads, deals |
| `sales.read` / `sales.manage` | Proposals |
| `projects.read` / `projects.manage` | Projects, milestones, tasks, templates apply |
| `finance.read` / `finance.manage` | Invoices, payments, refunds, credit notes, expenses |
| `forge_fund.read` / `forge_fund.manage` | View ledger / create CONTRIBUTION (manual), WITHDRAWAL, ALLOCATION |
| `forge_fund.approve` | Approve manual Forge Fund entries (`approved_by`) — required for manual writes |
| `documents.read` / `documents.manage` | Documents |
| `audit.read` | Read AuditLog |
| `portal.manage` | Grant/revoke ClientUser / client invitations |
| `team.workload.read` | Workload views |
| `*` | All of the above (FOUNDER_ADMIN) |

**Limitation (documented, not schema change):** There is no separate `payouts.*` permission or payout entity. Team distribution is covered by `forge_fund.*` only. Granular “view own allocation vs all allocations” is enforced in query layer:

- `FINANCE` / `FOUNDER_ADMIN` with `forge_fund.read`: all org entries.
- `TEAM_MEMBER`: may read entries where `approved_by = self` **or** where `metadata`/`reason` references them **only if** the product later stores member id in `reason`/`source_type` — **V1 default:** TEAM_MEMBER has **no** Forge Fund read unless granted via FOUNDER_ADMIN operational practice (assign FINANCE for fund visibility). Prefer: TEAM_MEMBER cannot list Forge Fund; FINANCE shares reports out-of-band. Document this as an intentional freeze limitation.

### 4.3 Default role → permission matrix

| Permission | FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER |
| --- | --- | --- | --- | --- | --- |
| `users.*` | ✓ | — | — | — | — |
| `crm.read` | ✓ | ✓ | ✓ | ✓ | limited¹ |
| `crm.manage` | ✓ | — | — | ✓ | — |
| `sales.read` | ✓ | ✓ | ✓ | ✓ | — |
| `sales.manage` | ✓ | — | — | ✓ | — |
| `projects.read` | ✓ | ✓ | ✓ | ✓ | assigned² |
| `projects.manage` | ✓ | ✓ | — | — | assigned tasks only³ |
| `finance.read` | ✓ | — | ✓ | limited⁴ | — |
| `finance.manage` | ✓ | — | ✓ | — | — |
| `forge_fund.read` | ✓ | — | ✓ | — | — |
| `forge_fund.manage` | ✓ | — | ✓ | — | — |
| `forge_fund.approve` | ✓ | — | ✓ | — | — |
| `documents.manage` | ✓ | ✓ | ✓ | ✓ | upload on assigned |
| `audit.read` | ✓ | — | ✓ | — | — |
| `portal.manage` | ✓ | — | — | ✓ | — |
| `team.workload.read` | ✓ | ✓ | — | — | own |

¹ TEAM_MEMBER: companies/contacts linked to assigned projects only.  
² Assigned as `Task.assignee_id` or `Project.owner_id`.  
³ Status/priority on own tasks; no project create/cancel.  
⁴ SALES: invoices for own deals/companies read-only optional — **V1: deny** unless FOUNDER_ADMIN widens (avoid finance leak). Default: SALES has no `finance.read`.

### 4.4 Authorization rules

1. Every query includes `organization_id` from the authenticated session — never from request body.
2. Detail endpoints re-check scope (no IDOR).
3. Portal: `PortalScopeGuard` at module level; `ClientUser.active === true` on sensitive actions.
4. Frontend hide/show is UX only — never security.

---

## 5. CRM APIs

### 5.1 Companies

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/companies` | `crm.read` |
| `GET` | `/companies/:id` | `crm.read` |
| `POST` | `/companies` | `crm.manage` |
| `PATCH` | `/companies/:id` | `crm.manage` |
| `POST` | `/companies/:id/archive` | `crm.manage` — sets `archived_at` |

Filters: `tag`, `q`, `archived`. Soft-delete only (never hard delete).

### 5.2 Contacts

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/contacts` | `crm.read` |
| `GET` | `/contacts/:id` | `crm.read` |
| `POST` | `/contacts` | `crm.manage` |
| `PATCH` | `/contacts/:id` | `crm.manage` |
| `POST` | `/contacts/:id/archive` | `crm.manage` |

Unique: `(organization_id, company_id, email)` when email set. Duplicate create → `409 CONTACT_EMAIL_EXISTS`. Inline create allowed inside Deal form (same `POST`).

### 5.3 Leads

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/leads` | `crm.read` |
| `GET` | `/leads/:id` | `crm.read` |
| `POST` | `/leads` | `crm.manage` |
| `PATCH` | `/leads/:id` | `crm.manage` (non-terminal fields) |
| `POST` | `/leads/:id/transition` | `crm.manage` |
| `POST` | `/leads/:id/convert` | `crm.manage` |
| `POST` | `/leads/:id/archive` | `crm.manage` |

**Lead → Deal conversion (`POST .../convert`):**

1. Lead status must be `QUALIFIED` (or allow from CONTACTED per product — **frozen machine:** convert only from path ending at Converted; API accepts convert when status ∈ {QUALIFIED} or explicitly `POST convert` performs `QUALIFIED→CONVERTED` atomically).
2. Transaction: create Deal (carry company/contact/source context), set Lead `status=CONVERTED`, `converted_to_deal_id=deal.id`.
3. Lead row never deleted.
4. Audit Tier A on Converted.

Sources: `LeadSource` enum. Filters: `status`, `source`, `q`.

### 5.4 Deals

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/deals` | `crm.read` |
| `GET` | `/deals/:id` | `crm.read` |
| `POST` | `/deals` | `crm.manage` |
| `PATCH` | `/deals/:id` | `crm.manage` (mutable fields; **not** stage) |
| `POST` | `/deals/:id/transition` | `crm.manage` |
| `POST` | `/deals/:id/reopen` | `crm.manage` — creates **new** Deal with `reopened_from_deal_id` |
| `POST` | `/deals/:id/archive` | `crm.manage` (rare) |

Filters: `stage`, `ownerId`, `source` (via lead), date range, `q`. Bulk: `POST /deals/bulk-reassign` (owner only).

**Deal transition body:** `{ "to": "WON", "lostReason": "PRICE" }`.

Rules: see §12 state machines. `WON` requires ≥1 Proposal `ACCEPTED` for deal. Side effect on `WON`: sync transaction creates Project + `DomainEvent(DealWon)` (§13).

### 5.5 Activities / notes / follow-ups / tags

- Activities/Notes: via Shared module nested or top-level (§10), attached with exactly one parent FK.
- Follow-up: `PATCH /deals/:id` field `next_follow_up_at` or included in `POST /activities` payload optional `nextFollowUpAt` when parent is Deal (single UX action per Doc 1 §7).
- Tags: Company `tags` string array — `PATCH /companies/:id` `{ "tags": ["…"] }`.

---

## 6. Sales APIs

### 6.1 Proposals

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/proposals` | `sales.read` |
| `GET` | `/proposals/:id` | `sales.read` |
| `POST` | `/proposals` | `sales.manage` — creates version `1`, `DRAFT` |
| `PATCH` | `/proposals/:id` | `sales.manage` — **only if status=DRAFT** |
| `PUT` | `/proposals/:id/line-items` | `sales.manage` — replace line items **only if DRAFT** |
| `POST` | `/proposals/:id/send` | `sales.manage` → `SENT`, set `sent_at`, DomainEvent `ProposalSent` |
| `POST` | `/proposals/:id/revise` | `sales.manage` — if status ≠ DRAFT: create **new row** `version+1` DRAFT copying lines; prior row frozen |
| `POST` | `/proposals/:id/transition` | Internal/portal-driven for VIEWED/REJECTED/EXPIRED; Accept primarily via portal |

**Immutability:** After leave `DRAFT`, PATCH of terms/lines rejected (`409 PROPOSAL_IMMUTABLE`). Edits = `revise`.

**Acceptance:** Portal `POST /portal/proposals/:id/accept` only from `SENT|VIEWED` → `ACCEPTED`. Does **not** auto-Won the Deal. Audit Tier A.

---

## 7. Projects APIs

### 7.1 Projects

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/projects` | `projects.read` |
| `GET` | `/projects/:id` | `projects.read` |
| `POST` | `/projects` | `projects.manage` — rare manual (pro-bono); normal path = Deal Won |
| `PATCH` | `/projects/:id` | `projects.manage` — name, deadline, owner; **not** status/phase |
| `POST` | `/projects/:id/status` | `projects.manage` |
| `POST` | `/projects/:id/phase` | `projects.manage` |
| `PATCH` | `/projects/:id/handover-checklist` | `projects.manage` |
| `POST` | `/projects/:id/complete` | `projects.manage` — requires checklist 100% `done` |

**No delete/archive endpoint** (frozen: Project has no soft-delete; use `CANCELLED` / `COMPLETED`).

### 7.2 Project templates

No `ProjectTemplate` table in frozen schema. Templates are **application configuration** (code/JSON in `projects` module), not CRUD entities.

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/project-templates` | `projects.read` — list config template ids/names |
| _(internal)_ | DealWon worker | Applies template milestones/tasks idempotently |

### 7.3 Milestones / Tasks / TimeEntries

| Method | Path | Perm |
| --- | --- | --- |
| `GET/POST` | `/projects/:id/milestones` | read/manage |
| `POST` | `/milestones/:id/transition` | manage |
| `GET/POST` | `/projects/:id/tasks` | read/manage |
| `PATCH` | `/tasks/:id` | manage / assignee self |
| `POST` | `/tasks/:id/transition` | manage / assignee |
| `POST` | `/tasks/:id/assign` | manage — audit Tier B |
| `GET/POST` | `/tasks/:id/time-entries` | read; create own |
| `DELETE` | `/time-entries/:id` | own entry or manage |

Task “blocked”: set `blocked_by_task_id` (side-flag), not a status enum value.

**Health:** derived read model on `GET /projects/:id` — e.g. overdue milestones, `AT_RISK` status, deadline proximity. Not a stored column.

---

## 8. Finance APIs

### 8.1 Invoices

| Method | Path | Perm | Idempotency |
| --- | --- | --- | --- |
| `GET` | `/invoices` | `finance.read` | — |
| `GET` | `/invoices/:id` | `finance.read` | — |
| `POST` | `/invoices` | `finance.manage` | Yes |
| `POST` | `/invoices/from-proposal` | `finance.manage` | Yes — copies snapshot lines from accepted proposal; **no live FK** |
| `PATCH` | `/invoices/:id` | `finance.manage` | Only `DRAFT`; send `version` for optimistic lock |
| `PUT` | `/invoices/:id/line-items` | `finance.manage` | Only `DRAFT` |
| `POST` | `/invoices/:id/send` | `finance.manage` | Yes — claims `InvoiceSequence` FOR UPDATE, freezes bill_to_snapshot + lines, `SENT` |
| `POST` | `/invoices/:id/void` | `finance.manage` | Only `DRAFT` and zero payments |
| `POST` | `/invoices/:id/cancel` | `finance.manage` | Reason required; CreditNote if payments exist |
| `POST` | `/invoices/:id/remind` | `finance.manage` | Outbox notification |

`pending_amount` = `amount - paid_amount` (computed, not stored).

### 8.2 Payments

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/payments` | `finance.read` |
| `GET` | `/payments/:id` | `finance.read` |
| `POST` | `/payments` | `finance.manage` — **manual/offline only**; `recorded_by` required; method ≠ RAZORPAY |
| `POST` | `/payments/razorpay/orders` | `finance.manage` or portal pay | Creates Razorpay order (external call **before** DB write of pending payment as designed) |

No DELETE. Reversal via Refund.

### 8.3 Refunds / Credit notes / Expenses

| Method | Path | Perm |
| --- | --- | --- |
| `POST` | `/refunds` | `finance.manage` — amount ≤ payment − prior refunds; may set Payment `REVERSED` |
| `GET` | `/refunds` | `finance.read` |
| `POST` | `/credit-notes` | `finance.manage` — claims `CreditNoteSequence`; lines optional |
| `GET` | `/credit-notes` | `finance.read` |
| `GET/POST` | `/expenses` | read/manage |
| `PATCH` | `/expenses/:id` | manage |

### 8.4 Forge Fund (`ForgeFundEntry` only)

**Invariant:** Client payment completion does **not** create member payouts. It may create one automatic `CONTRIBUTION` (webhook transaction). Distribution is a later, explicit finance action.

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/forge-fund-entries` | `forge_fund.read` |
| `GET` | `/forge-fund-entries/:id` | `forge_fund.read` |
| `GET` | `/forge-fund/balance` | `forge_fund.read` — `SUM(amount)` |
| `POST` | `/forge-fund-entries` | `forge_fund.manage` + `forge_fund.approve` |

`POST` body:

```json
{
  "type": "ALLOCATION" | "WITHDRAWAL" | "CONTRIBUTION",
  "amount": "5000.00",
  "reason": "Explicit allocation to member X for project Y — not a fixed split",
  "sourceType": null,
  "sourceId": null
}
```

Rules:

- Automatic payment contribution: created only inside payment webhook transaction; `source_type='payment'`, `source_id=payment.id`; unique partial index prevents double contribution.
- Manual entries: `source_id` null; `approved_by` = current user; Tier A audit.
- Amounts: positive CONTRIBUTION; negative WITHDRAWAL/ALLOCATION (per Doc 2).
- **No** 60/40 (or any) hard-coded split. Example: ₹12,000 payment → one CONTRIBUTION 12000; later ALLOCATION rows are explicit business decisions.
- No draft/approve/paid payout state machine — approval is the act of creating the entry with `approved_by` + audit.

### 8.5 Tax rates / sequences

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/tax-rates` | `finance.read` |
| `POST/PATCH` | `/tax-rates` | `finance.manage` / FOUNDER_ADMIN |
| `GET` | `/invoice-sequences` | `finance.read` |
| `GET` | `/credit-note-sequences` | `finance.read` |

Sequences are not manually incremented via API (only via send/finalize transactions).

---

## 9. Razorpay

### 9.1 Flow

1. Portal/internal creates Razorpay order (HTTP to Razorpay **outside** DB transaction).
2. Client pays on Razorpay Checkout.
3. Razorpay POSTs webhook → `POST /api/v1/webhooks/razorpay`.

### 9.2 Webhook handler (mandatory order)

1. Verify HMAC signature on **raw body** (reject 401 if invalid) — **before any DB write**.
2. Resolve `organization_id` (single-org V1: seeded org).
3. **Transaction:**
   - `INSERT WebhookEvent` (`source=RAZORPAY`, `external_event_id`) — unique violation → return **200** immediately (idempotent no-op).
   - Upsert `Payment` on `(organization_id, razorpay_payment_id)`.
   - Update `Invoice.paid_amount` (+ status PARTIALLY_PAID/PAID).
   - Conditionally insert `ForgeFundEntry` CONTRIBUTION (`source_type=payment`, `source_id=payment.id`).
4. Commit.
5. Async: notifications / DomainEvent consumers (never inside step 3).

### 9.3 Reconciliation

Nightly job: fetch Razorpay payments last 48h; diff vs local `Payment.razorpay_payment_id`; **alert only** — no silent auto-heal.

### 9.4 Refunds

Razorpay refund API call outside DB transaction; then insert `Refund` + possibly `Payment.status=REVERSED` in DB transaction; audit Tier A.

---

## 10. Shared module

### 10.1 Activities / Notes / Documents

| Method | Path | Notes |
| --- | --- | --- |
| `GET/POST` | `/activities` | Exactly one of companyId/contactId/dealId/projectId |
| `GET/POST` | `/notes` | Same; filter `visibility` in query for portal |
| `GET/POST` | `/documents` | + invoiceId exclusive parent; soft `deleted_at` |
| `POST` | `/documents/presign-upload` | R2 presigned URL; MIME/size checks |
| `GET` | `/documents/:id/download-url` | Short-lived signed URL |
| `POST` | `/documents/:id/delete` | Soft delete; audit Tier A |

### 10.2 Notifications / Audit / Events / Search

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/notifications` | own recipient |
| `POST` | `/notifications/:id/read` | own |
| `GET` | `/audit-logs` | `audit.read` — read-only; DB forbids UPDATE/DELETE for app role |
| `GET` | `/domain-events` | FOUNDER_ADMIN / ops debug |
| `GET` | `/search?q=` | authenticated internal |

---

## 11. Portal APIs

Base: `/api/v1/portal`. Auth: `portal_session`, `aud: portal`, `ClientUser.active`.

| Method | Path | Allowed |
| --- | --- | --- |
| `POST` | `/portal/auth/login` | Client login |
| `POST` | `/portal/auth/logout` | |
| `GET` | `/portal/me` | |
| `GET` | `/portal/projects` | company-scoped |
| `GET` | `/portal/projects/:id` | scope guard |
| `GET` | `/portal/projects/:id/milestones` | |
| `GET` | `/portal/proposals` | |
| `GET` | `/portal/proposals/:id` | |
| `POST` | `/portal/proposals/:id/accept` | SENT/VIEWED → ACCEPTED only |
| `GET` | `/portal/invoices` | |
| `GET` | `/portal/invoices/:id` | |
| `POST` | `/portal/invoices/:id/pay` | Start Razorpay checkout |
| `GET` | `/portal/documents` | `visibility=CLIENT_VISIBLE` **in query** |
| `GET` | `/portal/documents/:id/download-url` | parent scope + active check |
| `GET` | `/portal/projects/:id/handover` | checklist read-only summary |
| `GET/POST` | `/portal/support-tickets` | rate-limited |

### 11.1 CUSTOMER / ClientUser cannot

- Access other companies’ resources
- List internal Users, AuditLog, Forge Fund, Expenses, internal Notes (`INTERNAL`)
- PATCH invoice/payment status
- Generic proposal status updates (accept endpoint only)
- Use internal `/api/v1/*` with portal token

---

## 12. State machines

Arbitrary `PATCH { status }` is **rejected**. Use transition endpoints.

### 12.1 Lead

| From | To | Conditions | Audit |
| --- | --- | --- | --- |
| NEW | CONTACTED | Manual or first Activity | — |
| CONTACTED | QUALIFIED | Manual | — |
| QUALIFIED | CONVERTED | Convert API creates Deal | A |
| NEW/CONTACTED/QUALIFIED | DISQUALIFIED | Manual | A |
| CONVERTED / DISQUALIFIED | * | Forbidden | |

### 12.2 Deal

| From | To | Conditions | Audit | Side effects |
| --- | --- | --- | --- | --- |
| * (non-terminal) | next stage | Linear sales path | A | — |
| * (non-terminal) | LOST | `lost_reason` required | A | — |
| * (non-terminal) | WON | ≥1 ACCEPTED proposal | A | Project + DomainEvent DealWon |
| WON/LOST | * | Forbidden; use reopen → new Deal | | |

### 12.3 Proposal

DRAFT→SENT→VIEWED→ACCEPTED|REJECTED; SENT→EXPIRED (cron). Revise = new row. Audit all transitions (A).

### 12.4 Project status / phase

Status: ACTIVE ⇄ ON_HOLD; ACTIVE ⇄ AT_RISK; ACTIVE → COMPLETED|CANCELLED.  
Phase: linear Planning→…→Completed; skip only with override reason + audit.  
CLIENT_REVIEW→DEPLOYMENT blocked without gating milestone `approved_at`.  
COMPLETED blocked unless handover checklist all `done`.

### 12.5 Milestone / Task / Invoice / Payment / Maintenance / Ticket

As Document 1 §2 (enum names per Doc 2). Payment: never delete; Refund for reverse. Invoice: Draft editable only; Void only Draft with no payments; Cancel + CreditNote when money moved.

---

## 13. Transaction boundaries

| Operation | Sync DB transaction | Async after commit |
| --- | --- | --- |
| Deal → Won | Deal stage + Project create + DomainEvent DealWon | Template milestones/tasks; draft invoice; client invitation; notifications |
| Proposal accept | Proposal status + timestamps + DomainEvent | Notifications; Deal “ready for Won” signal |
| Invoice send | FOR UPDATE InvoiceSequence + freeze lines/snapshot + SENT | Email / PDF jobs |
| Credit note issue | FOR UPDATE CreditNoteSequence + insert CN + lines | Notifications |
| Manual payment | Payment insert + invoice paid_amount + optional Fund CONTRIBUTION | Notifications |
| Razorpay webhook | WebhookEvent + Payment upsert + paid_amount + Fund CONTRIBUTION | Notifications |
| Refund | Refund insert + Payment status if full | Gateway call **before** or **after** per gateway rules; never mid-transaction mixed incorrectly — prefer: gateway success then DB tx |
| Forge Fund manual entry | Insert entry + AuditLog | — |
| Proposal send | Status SENT + DomainEvent | Activity log; email link |

**Rule:** No Razorpay / Resend / R2 network I/O inside an open Prisma transaction.

---

## 14. Outbox / DomainEvent

Fixed consumers (Doc 1 §12) — no Kafka, no generic rules engine:

| Event | Consumers | Idempotency key |
| --- | --- | --- |
| DealWon | Projects template, draft invoice, invitation, notifications | `deal_id` |
| ProposalSent | Notifications, Activity | `proposal_id+version` |
| ProposalAccepted | Notifications, CRM flag | `proposal_id` |
| InvoiceCreated | Notifications | `invoice_id` |
| PaymentReceived | Notifications (finance core already sync) | `razorpay_payment_id` |
| PaymentOverdue | Notifications | `invoice_id+date` |
| ProjectPhaseChanged | Notifications / portal | `project_id+phase` |
| MilestoneCompleted | Notifications | `milestone_id` |
| MaintenanceExpiring | Notifications | `contract_id+threshold` |

Worker: poll `DomainEvent` where `status=PENDING` order by `created_at`; increment `attempts`; set PROCESSED/FAILED; exponential retry; surface failures in ops view.

---

## 15. Team module

No payout tables. Responsibilities:

| Method | Path | Perm |
| --- | --- | --- |
| `GET` | `/team/workload` | `team.workload.read` — tasks by assignee, capacity views |
| `GET` | `/team/forge-fund-entries` | Alias/filter of finance ledger for FINANCE — same data as `/forge-fund-entries` |

Member “payout” in business language = `ForgeFundEntry` with `type=ALLOCATION` or `WITHDRAWAL` created by FINANCE. Tracking “paid externally” is operational (reason text / bank ref in `reason`) — **not** a separate status column (limitation documented).

---

## 16. Security checklist (implementation)

- Organization scoping on every query  
- RBAC permissions §4  
- PortalScopeGuard module-wide  
- Rate limit: global + stricter auth/portal login  
- CSRF on portal mutating routes  
- httpOnly cookies; separate audiences  
- R2 signed upload/download URLs; MIME allowlist; `Content-Disposition: attachment`  
- Razorpay webhook HMAC  
- Invitation token hash + expiry + single-use + revoke  
- AuditLog Tier A/B per Doc 1 §9; DB REVOKE UPDATE/DELETE for `forge_app`  
- Authorization in WHERE clauses, never post-filter  

---

## 17. OpenAPI / Swagger

- Serve OpenAPI 3 at `/api/v1/docs` (internal network / FOUNDER_ADMIN in prod).
- Every operation documents: security scheme, required permission, request/response schemas, error codes, idempotency.
- Portal tagged separately (`portal`).
- Webhook documented with signature header requirements.

---

## 18. Maintenance & Support (entities exist)

Included because frozen schema has tables (Doc 1 Phase 8 priority does not remove APIs):

| Method | Path | Perm |
| --- | --- | --- |
| `GET/POST` | `/maintenance-contracts` | projects/finance manage as appropriate |
| `POST` | `/maintenance-contracts/:id/renew` | new row + `renewed_from_contract_id` |
| `POST` | `/maintenance-contracts/:id/cancel` | audit A |
| `GET/POST` | `/support-tickets` | operations + portal create |
| `POST` | `/support-tickets/:id/transition` | |

---

## 19. Final API inventory

Legend: **Txn** = sync DB transaction scope; **Audit** = Tier if required.

### Auth (12)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/auth/login` | Password login | Public | — | email, password | session | session create | Y | failed logins |
| POST | `/auth/logout` | Logout | Internal | — | — | 204 | revoke session | Y | — |
| GET | `/auth/session` | Session | Internal | — | — | session | — | — | — |
| GET | `/auth/me` | Current user | Internal | — | — | user+role | — | — | — |
| GET | `/auth/permissions` | Permissions | Internal | — | — | string[] | — | — | — |
| GET | `/auth/google/start` | SSO start | Public | — | — | redirect | — | — | — |
| GET | `/auth/google/callback` | SSO callback | Public | — | OAuth | session | upsert user | Y | A role if new |
| POST | `/auth/password-reset/request` | Reset request | Public | — | email | 204 | token+email async | Y | — |
| POST | `/auth/password-reset/confirm` | Reset confirm | Public | — | token, password | 204 | invalidate sessions | Y | A |
| POST | `/invitations` | Create invite | Internal | users.manage / portal.manage | scope, email, … | invitation | email async | Y | A |
| POST | `/invitations/:id/revoke` | Revoke | Internal | users.manage / portal.manage | — | invitation | — | Y | A |
| POST | `/invitations/accept` | Accept invite | Public | — | token, password? | session/user | used_at | Y | A |

### CRM (22)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/companies` | List | Int | crm.read | filters | list | — | — | — |
| GET | `/companies/:id` | Get | Int | crm.read | — | company | — | — | — |
| POST | `/companies` | Create | Int | crm.manage | dto | company | — | Y | — |
| PATCH | `/companies/:id` | Update | Int | crm.manage | dto | company | — | Y | — |
| POST | `/companies/:id/archive` | Soft archive | Int | crm.manage | — | company | archived_at | Y | — |
| GET | `/contacts` | List | Int | crm.read | filters | list | — | — | — |
| GET | `/contacts/:id` | Get | Int | crm.read | — | contact | — | — | — |
| POST | `/contacts` | Create | Int | crm.manage | dto | contact | — | Y | — |
| PATCH | `/contacts/:id` | Update | Int | crm.manage | dto | contact | — | Y | — |
| POST | `/contacts/:id/archive` | Archive | Int | crm.manage | — | contact | — | Y | — |
| GET | `/leads` | List | Int | crm.read | filters | list | — | — | — |
| GET | `/leads/:id` | Get | Int | crm.read | — | lead | — | — | — |
| POST | `/leads` | Create | Int | crm.manage | dto | lead | — | Y | — |
| PATCH | `/leads/:id` | Update | Int | crm.manage | dto | lead | — | Y | — |
| POST | `/leads/:id/transition` | Status | Int | crm.manage | to | lead | auto Contacted | Y | A if term. |
| POST | `/leads/:id/convert` | → Deal | Int | crm.manage | deal fields | {lead,deal} | create deal | Y | A |
| POST | `/leads/:id/archive` | Archive | Int | crm.manage | — | lead | — | Y | — |
| GET | `/deals` | List | Int | crm.read | filters | list | — | — | — |
| GET | `/deals/:id` | Get | Int | crm.read | — | deal | — | — | — |
| POST | `/deals` | Create | Int | crm.manage | dto | deal | — | Y | — |
| PATCH | `/deals/:id` | Update | Int | crm.manage | dto | deal | not stage | Y | — |
| POST | `/deals/:id/transition` | Stage | Int | crm.manage | to, lostReason? | deal | Won cascade | Y | A |
| POST | `/deals/:id/reopen` | New deal | Int | crm.manage | — | deal | new row | Y | A |
| POST | `/deals/bulk-reassign` | Bulk owner | Int | crm.manage | ids, ownerId | count | — | Y | B |

*(Convert + reopen bring CRM mutating set to 24 if counting bulk; inventory count uses unique routes below in §20.)*

### Sales (8)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/proposals` | List | Int | sales.read | filters | list | — | — | — |
| GET | `/proposals/:id` | Get | Int | sales.read | — | proposal+lines | — | — | — |
| POST | `/proposals` | Create v1 | Int | sales.manage | dto | proposal | — | Y | — |
| PATCH | `/proposals/:id` | Edit draft | Int | sales.manage | dto | proposal | DRAFT only | Y | — |
| PUT | `/proposals/:id/line-items` | Replace lines | Int | sales.manage | lines[] | proposal | DRAFT only | Y | — |
| POST | `/proposals/:id/send` | Send | Int | sales.manage | — | proposal | event | Y | A |
| POST | `/proposals/:id/revise` | New version | Int | sales.manage | — | new proposal | copy lines | Y | A |
| POST | `/proposals/:id/transition` | Viewed/Reject/Expire | Int | sales.manage | to | proposal | — | Y | A |

### Projects (18)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/projects` | List | Int | projects.read | filters | list | — | — | — |
| GET | `/projects/:id` | Get+health | Int | projects.read | — | project | — | — | — |
| POST | `/projects` | Manual create | Int | projects.manage | dto | project | — | Y | — |
| PATCH | `/projects/:id` | Update | Int | projects.manage | dto | project | — | Y | — |
| POST | `/projects/:id/status` | Status SM | Int | projects.manage | to | project | — | Y | A |
| POST | `/projects/:id/phase` | Phase SM | Int | projects.manage | to, override? | project | gates | Y | A |
| PATCH | `/projects/:id/handover-checklist` | Checklist | Int | projects.manage | items | project | — | Y | A on complete item |
| POST | `/projects/:id/complete` | Complete | Int | projects.manage | — | project | checklist 100% | Y | A |
| GET | `/project-templates` | List config | Int | projects.read | — | templates[] | — | — | — |
| GET | `/projects/:id/milestones` | List | Int | projects.read | — | list | — | — | — |
| POST | `/projects/:id/milestones` | Create | Int | projects.manage | dto | milestone | — | Y | — |
| POST | `/milestones/:id/transition` | SM | Int | projects.manage | to, reason? | milestone | — | Y | A/B |
| GET | `/projects/:id/tasks` | List | Int | projects.read | filters | list | — | — | — |
| POST | `/projects/:id/tasks` | Create | Int | projects.manage | dto | task | — | Y | — |
| PATCH | `/tasks/:id` | Update | Int | projects.manage | dto | task | — | Y | — |
| POST | `/tasks/:id/transition` | SM | Int | projects.manage | to | task | — | Y | reopen A/B |
| POST | `/tasks/:id/assign` | Assign | Int | projects.manage | assigneeId | task | notify async | Y | B |
| GET/POST | `/tasks/:id/time-entries` | Time | Int | projects.read/manage | dto | entries | — | Y | — |
| DELETE | `/time-entries/:id` | Delete time | Int | projects.manage | — | 204 | — | Y | — |

### Finance (28)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/invoices` | List | Int | finance.read | filters | list | — | — | — |
| GET | `/invoices/:id` | Get | Int | finance.read | — | invoice | — | — | — |
| POST | `/invoices` | Create draft | Int | finance.manage | dto | invoice | Idem | Y | — |
| POST | `/invoices/from-proposal` | Snapshot create | Int | finance.manage | proposalId | invoice | Idem | Y | — |
| PATCH | `/invoices/:id` | Edit draft | Int | finance.manage | dto+version | invoice | DRAFT | Y | — |
| PUT | `/invoices/:id/line-items` | Lines draft | Int | finance.manage | lines | invoice | DRAFT | Y | — |
| POST | `/invoices/:id/send` | Finalize | Int | finance.manage | — | invoice | sequence | Y | A |
| POST | `/invoices/:id/void` | Void | Int | finance.manage | — | invoice | DRAFT only | Y | A |
| POST | `/invoices/:id/cancel` | Cancel | Int | finance.manage | reason | invoice | CN if needed | Y | A |
| POST | `/invoices/:id/remind` | Reminder | Int | finance.manage | — | 202 | outbox | Y | — |
| GET | `/payments` | List | Int | finance.read | filters | list | — | — | — |
| GET | `/payments/:id` | Get | Int | finance.read | — | payment | — | — | — |
| POST | `/payments` | Offline pay | Int | finance.manage | dto | payment | paid_amount | Y | A |
| POST | `/payments/razorpay/orders` | Create order | Int | finance.manage | invoiceId | order | external | partial | — |
| GET | `/refunds` | List | Int | finance.read | — | list | — | — | — |
| POST | `/refunds` | Refund | Int | finance.manage | dto | refund | may reverse | Y | A |
| GET | `/credit-notes` | List | Int | finance.read | — | list | — | — | — |
| GET | `/credit-notes/:id` | Get | Int | finance.read | — | cn | — | — | — |
| POST | `/credit-notes` | Issue | Int | finance.manage | dto | cn | CN sequence | Y | A |
| GET | `/expenses` | List | Int | finance.read | — | list | — | — | — |
| POST | `/expenses` | Create | Int | finance.manage | dto | expense | — | Y | — |
| PATCH | `/expenses/:id` | Update | Int | finance.manage | dto | expense | — | Y | — |
| GET | `/forge-fund-entries` | Ledger | Int | forge_fund.read | filters | list | — | — | — |
| GET | `/forge-fund-entries/:id` | Get | Int | forge_fund.read | — | entry | — | — | — |
| GET | `/forge-fund/balance` | Balance | Int | forge_fund.read | — | {balance} | SUM | — | — |
| POST | `/forge-fund-entries` | Manual entry | Int | forge_fund.manage+approve | dto | entry | — | Y | A |
| GET | `/tax-rates` | List | Int | finance.read | — | list | — | — | — |
| POST | `/tax-rates` | Create | Int | finance.manage | dto | taxRate | — | Y | — |
| PATCH | `/tax-rates/:id` | Update | Int | finance.manage | dto | taxRate | — | Y | — |
| GET | `/invoice-sequences` | List | Int | finance.read | — | list | — | — | — |
| GET | `/credit-note-sequences` | List | Int | finance.read | — | list | — | — | — |
| POST | `/webhooks/razorpay` | Webhook | HMAC | — | raw+sig | 200 | pay+fund | Y | A |

### Team (2)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/team/workload` | Workload | Int | team.workload.read | filters | view | — | — | — |
| GET | `/team/members` | Member list | Int | users.read or workload | — | users[] | — | — | — |

### Portal (16)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| POST | `/portal/auth/login` | Login | Public | — | credentials | session | rate limit | Y | failed |
| POST | `/portal/auth/logout` | Logout | Portal | — | — | 204 | — | Y | — |
| GET | `/portal/me` | Me | Portal | active | — | clientUser | — | — | — |
| GET | `/portal/projects` | List | Portal | scope | — | list | — | — | — |
| GET | `/portal/projects/:id` | Get | Portal | scope | — | project | — | — | — |
| GET | `/portal/projects/:id/milestones` | Milestones | Portal | scope | — | list | — | — | — |
| GET | `/portal/projects/:id/handover` | Handover RO | Portal | scope | — | checklist | — | — | — |
| GET | `/portal/proposals` | List | Portal | scope | — | list | — | — | — |
| GET | `/portal/proposals/:id` | Get | Portal | scope | — | proposal | may mark VIEWED | Y | A |
| POST | `/portal/proposals/:id/accept` | Accept | Portal | scope+CSRF | — | proposal | event | Y | A |
| GET | `/portal/invoices` | List | Portal | scope | — | list | — | — | — |
| GET | `/portal/invoices/:id` | Get | Portal | scope | — | invoice | — | — | — |
| POST | `/portal/invoices/:id/pay` | Pay | Portal | scope+CSRF+active | — | checkout | Razorpay | external | — |
| GET | `/portal/documents` | List | Portal | scope+visible | — | list | — | — | — |
| GET | `/portal/documents/:id/download-url` | Download | Portal | scope+active | — | url | short TTL | — | — |
| GET/POST | `/portal/support-tickets` | Support | Portal | scope | dto | ticket | rate limit | Y | — |

### Shared (14)

| Method | Path | Purpose | Auth | Perm | Input | Output | Side effects | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/activities` | List | Int | crm/projects read | parent | list | — | — | — |
| POST | `/activities` | Create | Int | manage | dto+one parent | activity | maybe lead/deal | Y | — |
| GET | `/notes` | List | Int | read | parent | list | — | — | — |
| POST | `/notes` | Create | Int | manage | dto | note | — | Y | — |
| PATCH | `/notes/:id` | Update | Int | manage | dto | note | visibility B | Y | B if vis |
| GET | `/documents` | List | Int | documents.read | parent | list | — | — | — |
| POST | `/documents/presign-upload` | Presign | Int | documents.manage | meta | url | — | — | — |
| POST | `/documents` | Register | Int | documents.manage | meta | document | after upload | Y | — |
| GET | `/documents/:id/download-url` | Signed GET | Int | documents.read | — | url | — | — | — |
| POST | `/documents/:id/delete` | Soft delete | Int | documents.manage | — | document | — | Y | A |
| GET | `/notifications` | List | Int | self | — | list | — | — | — |
| POST | `/notifications/:id/read` | Mark read | Int | self | — | notification | — | Y | — |
| GET | `/audit-logs` | List | Int | audit.read | filters | list | — | — | — |
| GET | `/domain-events` | Outbox debug | Int | FOUNDER_ADMIN | filters | list | — | — | — |
| GET | `/search` | Global FTS | Int | authenticated | q | hits | — | — | — |

### Maintenance (6)

| Method | Path | Purpose | Auth | Perm | Txn | Audit |
| --- | --- | --- | --- | --- | --- | --- |
| GET/POST | `/maintenance-contracts` | CRUD-ish | Int | projects/finance | Y | — |
| POST | `/maintenance-contracts/:id/renew` | Renew chain | Int | manage | Y | B |
| POST | `/maintenance-contracts/:id/cancel` | Cancel | Int | manage | Y | A |
| GET/POST | `/support-tickets` | Tickets | Int | operations | Y | — |
| POST | `/support-tickets/:id/transition` | SM | Int | operations | Y | A on close/reopen |

---

## 20. Endpoint count summary

| Group | Count (approx. distinct routes) |
| --- | --- |
| Auth | 12 |
| CRM | 24 |
| Sales | 8 |
| Projects | 19 |
| Finance (+ webhook) | 32 |
| Team | 2 |
| Portal | 16 |
| Shared | 15 |
| Maintenance/Support | 6 |
| **Total** | **~134** |

---

## 21. Cross-check vs Documents 1–4

| Area | Result |
| --- | --- |
| Modules | Match Doc 1 §13 |
| UserRole | Frozen five roles only; ClientUser separate |
| Entities | Only schema entities; no TeamPayout; templates = config |
| Soft-delete | Company/Contact/Lead/Deal/Document only; not Invoice/Payment/Project |
| Sequences | InvoiceSequence + CreditNoteSequence |
| Snapshots | Invoice from proposal copies values |
| Webhook | HMAC → WebhookEvent → Payment → paid_amount → Fund CONTRIBUTION |
| Outbox | DomainEvent; no Kafka |
| Forge Fund | CONTRIBUTION/WITHDRAWAL/ALLOCATION only; no hard-coded split |

### G. Documentation ambiguities (no schema change)

1. **TEAM_MEMBER Forge Fund visibility** — no first-class “own payout” link field; V1 denies TEAM_MEMBER `forge_fund.read`.
2. **“Payout paid” tracking** — no status column; use `reason` / operational process.
3. **SALES finance.read** — default deny to avoid leakage.
4. **Lead convert exact precondition** — Doc 1 converts to CONVERTED from qualified path; API uses dedicated convert command.
5. **Project templates** — not persisted; config-only.
6. **Google Workspace SSO** — provider fixed; OAuth client config is env, not schema.

### H. Documents 1–4

**Unchanged.** No Prisma/migration/marketing edits in this task.

---

## Final status

**DOCUMENT 5 BACKEND/API SPECIFICATION COMPLETE — READY FOR IMPLEMENTATION**
