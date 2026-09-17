# FORGE Business OS — Implementation Phase B2: CRM Backend

**Status:** Complete and verified. 140 backend tests passing against a real local PostgreSQL database (34 unit + 106 e2e — up from Phase 1's 90; the 16 new tests beyond the CRM-specific ones are all Phase 1's own suite re-verified unchanged). 310 frontend tests (pre-existing, unaffected). Companies, Contacts, Leads, Deals, and Activities are now real, organization-scoped, RBAC-enforced, audited backend resources.

**Scope:** Document 5 §5's CRM APIs only. No Sales/Proposal, Projects, Finance, or Team business logic was implemented — where those would matter (Deal WON's Proposal precondition, Deal WON's Project/DomainEvent side effect), this phase implements exactly the CRM-side contract and no more, per its own instruction.

---

## Step 1 — Inspection

Read in full before writing code: `docs/FORGE Business OS — Database Specification (Frozen Architecture v1).md`, `docs/FORGE-BUSINESS-OS-BACKEND-API-SPECIFICATION.md` (Document 5), `docs/FORGE-BUSINESS-OS-AUTH-RBAC-SECURITY-SPECIFICATION.md` (Document 6), `prisma/schema.prisma`'s CRM models (`Company`, `Contact`, `Lead`, `Deal`, `Activity`, plus `Proposal` for the WON precondition), the three hand-written SQL files in `prisma/sql/` (polymorphic CHECK constraints, the Contact-email partial unique index, FTS GIN indexes — all already embedded in the applied migration, confirmed via `prisma/sql/README.md`), and the complete Phase 1 auth/RBAC implementation (guards, decorators, `AuditService`, `OrganizationContextService`, DTO/controller/service conventions).

No genuine frozen-architecture conflict required a schema change — `git diff --stat prisma/schema.prisma prisma/migrations/` is empty throughout this phase. Two real, narrower issues were found and are documented precisely below rather than silently resolved: the "first Activity auto-transitions a Lead" rule (§D below) and a Document 5/6 permission-granularity gap for Activities (§H below).

---

## A. Companies implemented

`GET /companies`, `GET /companies/:id`, `POST /companies`, `PATCH /companies/:id`, `POST /companies/:id/archive` — exactly Document 5 §5.1. Fields match the frozen schema exactly (`name`, `gstin`, `billingState`, `billingAddress`, `tags`). Filters: `tag`, `q`, `archived` (offset pagination, "small" table class per §2.4). Soft-delete only — `archived_at`, never a hard delete; re-archiving an already-archived company is rejected (`409 COMPANY_ALREADY_ARCHIVED`), not silently accepted. Direct `GET /:id` shows archived companies too (Document 6 §3.2 "recommend allow" for admin direct-fetch); the default list excludes them.

## B. Contacts implemented

`GET /contacts`, `GET /contacts/:id`, `POST /contacts`, `PATCH /contacts/:id`, `POST /contacts/:id/archive` — Document 5 §5.2. `companyId` FK, validated to belong to the caller's organization before being written (see I below). Cursor pagination (Contact is in the "high-growth" table class per §2.4). **Filter set is a documented gap-fill**: Document 5 §5.2 lists no explicit `Filters:` line for Contacts (unlike its three siblings) — `companyId` was added as the minimum necessary to satisfy the "company relationship" requirement (it's an indexed FK, staying within §2.5's "indexed columns only" rule even though the spec doesn't spell it out for this resource); `q`/`archived` mirror the pattern used elsewhere for consistency.

## C. Leads implemented

`GET /leads`, `GET /leads/:id`, `POST /leads`, `PATCH /leads/:id` (non-terminal fields only — never `status`), `POST /leads/:id/transition`, `POST /leads/:id/convert`, `POST /leads/:id/archive` — Document 5 §5.3. Filters: `status`, `source`, `q`. The lifecycle state machine (`policies/lead-state-machine.ts`) implements Document 5 §12.1 exactly: `NEW→CONTACTED→QUALIFIED`, `{NEW,CONTACTED,QUALIFIED}→DISQUALIFIED`, both terminal states forbidding any further transition. `CONVERTED` is explicitly unreachable via `/transition` — attempting it returns a distinct `400 LEAD_USE_CONVERT_ENDPOINT` rather than either silently succeeding or a generic invalid-transition error.

## D. Lead conversion

`POST /leads/:id/convert` — QUALIFIED-only precondition, fully transactional, race-safe against duplicate conversion, audited Tier A. See the [conversion transaction](#the-lead-conversion-transaction) section below for exactly how. The client can never fabricate the target Deal — the convert DTO has no `dealId` field at all (an attempt to send one is rejected by `forbidNonWhitelisted`, verified by test), and company/contact context is inherited from the Lead itself, not re-supplied by the caller.

**A real, schema-blocked limitation found and not silently worked around:** Document 5 §12.1's `NEW→CONTACTED` row says "Manual **or first Activity**" — but `Activity` has no `lead_id` column, and its DB CHECK constraint (`prisma/sql/001_check_constraints.sql`) only permits `company_id`/`contact_id`/`deal_id`/`project_id` as the exactly-one parent. An Activity can never reference a Lead in the frozen schema, so "first Activity auto-transitions the Lead" is not implementable without a schema change (out of this phase's authority). Only the "Manual" half of that same table row — which is always available regardless — is implemented. This is a genuine frozen-architecture conflict, reported here rather than worked around by, say, silently adding a Lead-Activity relation.

## E. Deals implemented

`GET /deals`, `GET /deals/:id`, `POST /deals`, `PATCH /deals/:id` (mutable fields only — never `stage`), `POST /deals/:id/transition`, `POST /deals/:id/reopen`, `POST /deals/:id/archive`, `POST /deals/bulk-reassign` — Document 5 §5.4/§19's full 8-route inventory, including the easy-to-miss `bulk-reassign` route. Filters: `stage`, `ownerId`, `source` (via the originating Lead — a Prisma relation filter through `Deal.converted_leads`, no raw SQL needed), date range, `q`. `owner_id` defaults to the acting user if omitted, validated in-org either way (schema requires it non-null).

## F. Deal state machine

`policies/deal-state-machine.ts` + `DealsService.transition` implement Document 5 §12.2 precisely: from any non-terminal stage, the single "next" stage in the linear path (`NEW→CONTACTED→QUALIFIED→DISCOVERY→PROPOSAL_SENT→NEGOTIATION`) is always allowed; `LOST` (reason required) and `WON` (accepted-proposal required) are allowed from **any** non-terminal stage, not just the adjacent one; `WON`/`LOST` are terminal — only `/reopen` (which creates a **new** Deal row with `reopenedFromDealId` set, never mutates the closed one) can move past them.

**WON's precondition queries `Proposal` directly via Prisma** (`this.prisma.proposal.findFirst({ where: { deal_id, status: 'ACCEPTED' } })`) — not through a `sales` module import (Document 5 §1 forbids `crm` importing `sales`; no such module exists yet regardless). This is the task's own explicitly-requested resolution: "implement the CRM-side contract so the dependency fails explicitly with the documented error rather than inventing proposal data or bypassing the rule." Concretely: until B3 (Sales) ships an endpoint that can create an `ACCEPTED` proposal, **every** real WON attempt will correctly fail with `422 DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL` (Document 5 §2.8's own example error code) — verified by test, including the success path once an accepted proposal is seeded directly (the only way to exercise it before B3 exists).

**Deal WON's downstream side effects are explicitly not implemented** — Document 5 §13 pairs WON with "Project + DomainEvent(DealWon)" in the same sync transaction, but the task's own scope instruction says: "Only implement the CRM-side prerequisite/transition behavior. Do NOT implement the full downstream Deal Won outbox/project/invoice workflow... Do not duplicate future B3/B4/B5 logic." `applyTransition` performs the stage change and Tier A audit only — no `Project` row, no `DomainEvent` row. This is a deliberate scope boundary, not an oversight.

## G. Activities

`GET /activities`, `POST /activities` — Document 5 §10.1's exact route pair (no detail-by-id route exists in the frozen inventory, so none was added). B2 scope only ever populates `companyId`/`contactId`/`dealId` as the Activity's one parent — `projectId` is never accepted by the DTO (Projects/B4 doesn't exist; there would be no way to validate it belongs to the caller's org). Exactly-one-parent is enforced at the application level to mirror the DB CHECK constraint for the subset this phase can populate. `nextFollowUpAt` (Document 5 §5.5's "single UX action") is accepted only when the parent is a Deal, and atomically updates `Deal.next_follow_up_at` in the same transaction as the Activity insert.

## H. RBAC

Reused entirely from Phase 1 — `JwtAuthGuard`, `PermissionsGuard`, `@RequirePermissions(...)`, the existing error envelope, the existing request-id/logging stack. No new permission was added to Document 5 §4.2's frozen 18-permission catalog. Two genuine granularity gaps between the coarse permission catalog and Document 6 §2.3's finer resource-level matrix were resolved via a new **resource authorization** layer (`policies/resource-authorization.ts` — exactly the layer Phase 1's own `permissions.ts` comment anticipated for "Phase 2+"), not by inventing new permissions:

- **Leads/Deals deny TEAM_MEMBER entirely.** Document 6 §2.3 marks Leads/Deals `—` (denied) for TEAM_MEMBER, not `L` (limited) — and Document 5 §4.3 footnote ¹'s own text only ever names "companies/contacts" as TEAM_MEMBER's limited-visibility subset, never leads/deals, so the two documents agree once read precisely. TEAM_MEMBER still holds the coarse `crm.read` grant (so Companies/Contacts routes are reachable), but `assertCrmRoleMayAccessLeadsOrDeals` denies it outright on every Leads/Deals route.
- **Companies/Contacts are scoped to "assigned projects" for TEAM_MEMBER** (Document 5 §4.3 footnote ¹ / Document 6 footnote ³) — a scope B2 cannot compute, since Project/Task assignment is B4. This **fails closed**: TEAM_MEMBER's list returns empty, and a direct `GET /:id` on a real company/contact returns `403`, until B4 gives this a real scope to resolve against. Documented as a forward-looking limitation, not a bug.
- **Activities' creator role set doesn't match `crm.manage`.** Document 6 §2.3 grants FOUNDER_ADMIN/OPERATIONS/FINANCE/SALES all full Activity create — but OPERATIONS and FINANCE don't hold `crm.manage` (verified against Phase 1's `ROLE_PERMISSIONS`). Gating Activity creation on `crm.manage` would have wrongly excluded two roles Document 6 explicitly grants it to. `assertCanCreateActivity` checks the exact role set Document 6 names, independent of the coarser `crm.*` grants — verified by test that OPERATIONS can create an Activity despite lacking `crm.manage`.

## I. Organization isolation

Every list/get query filters by `organization_id` from the authenticated session — never from the request body or a query param. Every client-supplied foreign key (`companyId`, `contactId`, `dealId`, `ownerId`) is validated to belong to the caller's organization **before** being written onto a new row (`services/scope-guards.ts`) — this is the "accessing another organization's records through nested relations" defense the task specifically asks for: without it, a client could link a Contact to another organization's Company by UUID alone, since a bare Prisma FK constraint only requires the referenced row to exist *somewhere*, not that it belongs to the caller. A cross-org reference returns `404` (Document 6 §3.2: "no existence leak"), verified by test for every resource that accepts a cross-resource FK (Contact→Company, Lead→Company/Contact, Deal→Company/Contact/owner, Activity→Company/Contact/Deal).

## J. Resource authorization foundation

`policies/resource-authorization.ts` is the concrete "Phase 2+" layer Phase 1's `permissions.ts` comment described in advance — row/role-level narrowing that a flat permission grant can't express, applied per-resource now that real resources exist. See H above for the three cases it currently handles.

## K. Transactions

- **Lead conversion** (`LeadsService.convert`): see the dedicated section below.
- **Deal WON**: stage update + audit only (see F above) — no multi-step transaction needed since no side effects are implemented in this phase.
- **Activity + `nextFollowUpAt`**: `ActivitiesService.create` wraps the Activity insert and the Deal's `next_follow_up_at` update in one `$transaction` when both apply, so the "single UX action" Document 5 §5.5 describes can't partially apply.

### The Lead conversion transaction

```
$transaction(async (tx) => {
  const deal = await tx.deal.create({ ...carrying company/contact context from the Lead... });

  const result = await tx.lead.updateMany({
    where: { id, organization_id, status: QUALIFIED, converted_to_deal_id: null },
    data: { status: CONVERTED, converted_to_deal_id: deal.id },
  });
  if (result.count !== 1) throw ConflictException(...); // rolls back the Deal insert too

  return { lead: refreshed, deal };
});
```

The conditional `updateMany` — not a plain `update` — is the actual race-safety mechanism: Prisma's `update` requires its `where` to resolve to a unique constraint, so a status-conditional single-row update isn't expressible that way. `updateMany`'s `where` has no such restriction, and its `count` result tells you whether the condition was still true at write time. Two concurrent conversion attempts on the same Lead: at most one `updateMany` reports `count === 1`; the other reports `0`, throws inside the transaction callback, and Prisma rolls back that attempt's `Deal` insert along with it — so no duplicate Deal is ever left behind. **Verified with a real concurrency test** (`Promise.all` of two simultaneous convert requests against the same Lead, not just two sequential ones), confirmed stable across repeated runs.

## L. Security/red-team results

Every vector the task lists, tested against the real HTTP surface (not unit-mocked):

| Vector | Result | Evidence |
| --- | --- | --- |
| Cross-org IDOR (direct) | Pass | Every resource's `get()` scopes by `organization_id`; a real UUID from another org returns `404` |
| Cross-org IDOR (nested relations) | Pass | `scope-guards.ts` — a client cannot link a Contact/Lead/Deal/Activity to another org's Company/Contact/Deal by UUID; `404`, not a silent cross-org link |
| Unauthorized CRUD | Pass | Every mutating route requires `crm.manage` (or the Activities-specific role check); denial is `403 FORBIDDEN_PERMISSION` |
| Unauthorized state transitions | Pass | Same `crm.manage` gate on `/transition` routes; RBAC test confirms TEAM_MEMBER is denied Leads/Deals entirely |
| Invalid state transitions | Pass | Lead: skip-ahead (`NEW→QUALIFIED`) rejected `409`; `CONVERTED` unreachable via `/transition`. Deal: skip-ahead rejected `409`; post-terminal transition rejected `409 DEAL_TERMINAL_STAGE` |
| Archived-resource behavior | Pass | Default lists exclude archived; direct `GET /:id` still shows them; re-archiving an already-archived row is `409`, not silently accepted |
| Duplicate conversion | Pass | Both sequential (precondition check) and true-concurrent (atomic `updateMany` guard) cases tested — see K above |
| Duplicate unique fields | Pass | Contact email uniqueness (`org + company_id` partial unique index) — duplicate returns `409 CONTACT_EMAIL_EXISTS`; the same email under a *different* company is correctly allowed (proves the scope is exactly `org+company`, not just `org`) |
| Malformed UUIDs | Pass | `ParseUUIDPipe` on every `:id` param — `400`, not `500` or a silent bypass |
| Validation bypass | Pass | `forbidNonWhitelisted` rejects unknown fields (mass assignment — an attempt to set `organizationId` directly on create is rejected `400`); money fields reject non-`Decimal(12,2)`-shaped strings (e.g. `"15000"` without cents) |
| Privilege escalation | Pass | RBAC gate is server-side only, re-verified per request against the live session — no CRM route trusts a client-supplied role/permission claim |
| Organization_id spoofing | Pass | `organization_id` is read only from `request.user.organizationId` (the authenticated session), never from the request body — no CRM DTO has an `organizationId` field, and `forbidNonWhitelisted` would reject one if sent |
| Mass assignment | Pass | Same as validation bypass above — every DTO whitelists exactly its intended fields |

## M. Tests — exact counts

**Backend:** 34 unit (unchanged from Phase 1 — no new unit tests were needed; CRM logic is exercised end-to-end instead) + **106 e2e** (Phase 1's 56 unchanged and re-verified passing, plus **50 new CRM e2e tests** across five files: `crm-companies.e2e-spec.ts`, `crm-contacts.e2e-spec.ts`, `crm-leads.e2e-spec.ts`, `crm-deals.e2e-spec.ts`, `crm-activities.e2e-spec.ts`) — **140 total**, all passing against real local PostgreSQL, no mocked Prisma. **Frontend:** 310 (pre-existing, unaffected — confirmed re-run clean).

Two real bugs were found and fixed by this suite while writing it (not weakened to pass — see Errors and fixes below): a DTO-level validator that pre-empted a custom error code, and a test itself asserting the wrong (though still-secure) rejection code for a sequential duplicate-conversion attempt, which a real concurrency test then replaced with a stronger, timing-correct assertion.

## N. Regression results

Phase 0/Phase 1 fully intact: `npm run typecheck` (api + web) clean, `npm run lint` (api + web) — 0 errors, 259 warnings (all the same pre-existing `no-unsafe-*` pattern on Supertest's loosely-typed `App`/`response.body`, Phase-1-accepted; the CRM test files' own array-method calls on `response.body.data` were fixed via a small typed `listData()` helper rather than adding new warnings), `npm run build` (api + web) clean — the frontend build additionally confirms its own pre-existing `/crm/companies`, `/crm/contacts`, `/crm/deals`, `/crm/leads` routes compile (built by parallel work, now with a real backend to call). All 34 unit + 106 e2e backend tests and 310 frontend tests pass.

## O. Files changed

**New:** `apps/api/src/modules/crm/**` (5 controllers, 5 services, 5 DTO files, 2 state-machine policy files, 1 resource-authorization policy file, 1 scope-guards helper, `crm.module.ts`), `apps/api/src/common/pagination/**` (offset + cursor pagination helpers), `apps/api/src/common/validation/money.ts`, `apps/api/src/common/serialization/camel-case.ts`, `apps/api/src/common/interceptors/camel-case-response.interceptor.ts`, `apps/api/test/crm-{companies,contacts,leads,deals,activities}.e2e-spec.ts`, `apps/api/test/support/crm.ts`, this document.

**Modified:** `apps/api/src/app.module.ts` (registers `CrmModule`), `apps/api/src/main.ts` + `apps/api/test/support/bootstrap.ts` (register `CamelCaseResponseInterceptor` — see the note below), `apps/api/src/modules/shared/audit.service.ts` (five new `AUDIT_ACTIONS` entries for Lead/Deal events).

**Not touched:** `prisma/schema.prisma`, `prisma/migrations/**`, `/Users/atharva/Forge`, `apps/web/**` (see Q below), any B3/B4/B5/B6/B7 concern.

**One infrastructure fix applied across the whole API, not just CRM, and worth calling out precisely:** Phase 1's services returned raw Prisma rows directly, which are `snake_case` (the schema's own field names — `archived_at`, `organization_id`, no `@map` renaming) — inconsistent with Phase 1's own `AuthService`, which hand-mapped its responses to camelCase. Rather than hand-write five more camelCase view-mapper functions, a global `CamelCaseResponseInterceptor` was added (deep-transforms every response body's keys, treating `Date`/Prisma `Decimal` as opaque leaves so it doesn't corrupt a `Decimal`'s internal fields by recursing into them). This is a real correctness fix, not a stylistic one — without it, every CRM endpoint would have silently returned inconsistent casing from the rest of the API. Confirmed it doesn't change any Phase 1 response shape that already happened to be camelCase (a no-op transform on keys with no underscores) — re-ran the full Phase 1 suite to verify.

## P. Prisma/schema/migration status

**Unchanged.** `git diff --stat prisma/schema.prisma prisma/migrations/` is empty, confirmed both before writing any code and again at completion. No `prisma migrate`/`db push`/`migrate reset` command was run — only `prisma generate` implicitly via the existing build/test scripts, which regenerates the client from the unchanged schema and writes no schema/migration files.

## Q. Frontend untouched confirmation

`apps/web/**` was not edited by this phase. `apps/web/src/features/portal/**` shows as modified in `git status` — this is **parallel, in-progress work by another process** (Client Portal / `ClientUser` frontend, out of B2's CRM scope), discovered live via `git status`, not authored here and **deliberately excluded from this phase's commit** per the task's explicit instruction not to sweep uncommitted frontend changes into the B2 commit. It remains uncommitted in the working tree for its own owner.

## R. Marketing repo untouched confirmation

Confirmed: `git status` in `/Users/atharva/Forge` is identical to its state before this phase began (`src/app/api/contact/route.ts` modified, `docs/` and `src/lib/email/` untracked — the same pre-existing state carried since before Phase 0).

## S. Commit hash

Recorded in the final report at the end of this phase's reply, once created — this document is written before the commit, matching the git-safety ordering used in Phase 1 (docs → final diff/status review → commit).

## T. Remaining limitations/open decisions

Everything Document 6 §26 already lists remains open and unaffected by this phase. New items surfaced specifically by B2:

1. **"First Activity auto-transitions a Lead"** (Document 5 §12.1) is not implementable without a schema change — `Activity` has no `lead_id` and its CHECK constraint doesn't include Lead as a valid parent. Flagged, not worked around (see D above).
2. **TEAM_MEMBER's "assigned projects" scope for Companies/Contacts** currently resolves to empty (fail-closed) because Project/Task assignment (B4) doesn't exist yet. Whoever builds B4 needs to come back and wire a real scope into `teamMemberScopedCompanyContactWhere`/`assertTeamMemberMayViewCompanyOrContact` in `policies/resource-authorization.ts`.
3. **`archived` query-param semantics for Companies** (`omitted` = active only, `true` = archived only) is an implementation choice, not written explicitly in Document 5 §5.1 beyond naming `archived` as a filter — a reasonable, documented default, not a claimed frozen value.
4. **Contact/Company/Deal `q` search uses case-insensitive `contains`, not the Postgres FTS GIN indexes** that already exist (`companies_name_fts_idx`, `contacts_name_email_fts_idx`, `deals_title_fts_idx`) — correct results at this phase's data volume (single org), but doesn't yet use the index Document 2 provisioned for it. A real `to_tsvector`/`plainto_tsquery` wiring is future work, not a correctness gap today.
5. **Lead `q` search has no backing FTS index at all** (no GIN index exists for `notes`) — implemented as a plain `contains` on `notes`, the only free-text field a Lead has; Document 5 §5.3 names `q` as a filter without specifying its backing mechanism.
6. **Deal `bulk-reassign`'s audit entry has no single natural `entity_id`** (it affects N deals at once) — recorded with the new owner's id as the audit subject and the full affected-id list in `after`, a reasonable choice Document 5/6 don't specify further.

## U. Frozen-architecture conflicts

One genuine conflict, already detailed in D above and not silently resolved: **Document 5 §12.1's "first Activity" auto-transition for Leads cannot be implemented against the frozen `Activity` schema** (no `lead_id` column; the CHECK constraint doesn't permit Lead as a parent type). No schema change was made to work around it — only the "Manual" half of that transition rule (which the same table row explicitly also allows) is implemented. Everything else in Documents 5/6 was implementable within the frozen schema as-is.

---

**IMPLEMENTATION PHASE B2 COMPLETE**
