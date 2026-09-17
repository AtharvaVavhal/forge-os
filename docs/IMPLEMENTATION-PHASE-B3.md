# FORGE Business OS — Implementation Phase B3: Sales / Proposals Backend

**Status:** Implementation complete and verified. 137 backend tests passing (34 unit + 106 pre-existing e2e re-verified + 31 new B3 e2e) against real local PostgreSQL, confirmed in a single complete run immediately after implementation. See [Regression results](#n-regression-results) for an important, fully-disclosed caveat about re-verifying this at commit time, caused by unrelated concurrent work — not by this phase's own code.

**Scope:** Document 5 §6.1's Proposal API only. No Client Portal, no Project creation/Deal-Won automation beyond what B2 already implemented, no Invoices/Payments/Razorpay.

---

## Step 1 — Inspection

Read in full: `docs/FORGE Business OS — Database Specification (Frozen Architecture v1).md`, `docs/FORGE-BUSINESS-OS-BACKEND-API-SPECIFICATION.md` (Document 5 §6.1, §12.3, §13, §19), `docs/FORGE-BUSINESS-OS-AUTH-RBAC-SECURITY-SPECIFICATION.md` (Document 6 §2.3, §17), `prisma/schema.prisma`'s `Proposal`/`ProposalLineItem`/`TaxRate` models, the existing B1/B2 implementation (guards, `AuditService`, DTO/controller/service conventions, `CamelCaseResponseInterceptor`), and — critically — the **already-implemented frontend** at `apps/web/src/features/sales/` (built in parallel, ahead of this backend).

The frontend turned out to be an unusually strong, precise cross-check: its own `nextProposalTransitions()` helper already excludes `ACCEPTED` from internal transition targets with the comment "Accept is portal-only," and its Deal detail page explicitly documents *why* it doesn't filter `GET /proposals` by `dealId` — *"This screen does not list proposals because `GET /proposals` has no documented `dealId` [filter]."* Both independently confirm the exact same reading of Document 5 this phase arrived at from the spec alone. No frontend/spec contract discrepancy was found — see R below.

No frozen-architecture conflict required a schema change — `git diff --stat prisma/schema.prisma prisma/migrations/` is empty throughout.

---

## A. Proposal implementation

`GET /proposals`, `GET /proposals/:id`, `POST /proposals`, `PATCH /proposals/:id`, `PUT /proposals/:id/line-items`, `POST /proposals/:id/send`, `POST /proposals/:id/revise`, `POST /proposals/:id/transition` — Document 5 §6.1/§19's exact 8-route inventory, no more, no fewer. `GET /proposals/:id` eager-loads `line_items` + a `deal: {id, title}` summary (Document 5 §19: detail is "proposal+lines," list is just "list") — `deal` is additionally included on `GET /proposals` too, matching the frontend's own `Proposal.deal: NamedRef | null` type, which treats it as a real, expected field with a graceful fallback if absent.

## B. Proposal line items

`PUT /proposals/:id/line-items` is a full, atomic replace (delete all + recreate, one `$transaction`), DRAFT-only. Fields match the frozen schema exactly: `description`, `quantity` (`Decimal(10,2)`), `unitPrice`/`unit_price` (`Decimal(12,2)`), `taxRateId`/`tax_rate_id` (optional, validated in-org), `sortOrder`/`sort_order`. No `amount`/`total` field exists anywhere in the frozen `ProposalLineItem` or `Proposal` models — none was invented; the frontend's own detail page explicitly says the same thing ("Amount and proposal totals are not stored on ProposalLineItem... no total field exists on the frozen Proposal model").

**Money handling — a real bug found and fixed, not just followed by convention:** decimal strings are validated on input (`IsMoneyString`/new `IsQuantityString`, matching each field's actual DB scale — `Decimal(10,2)` for quantity is 8 integer digits, narrower than the `Decimal(12,2)` money fields' 10) and passed straight through to Prisma as strings, never parsed into a JS float. On the **output** side, an e2e assertion caught that Prisma's `Decimal` (a `decimal.js` value under the hood) defaults `.toString()`/`.toJSON()` to its significant digits, silently dropping trailing zeros — a value stored and read back from Postgres as exactly `"2.50"` was serializing onto the wire as `"2.5"` (and a whole-number value like `"15000.00"` would have come back as bare `"15000"`, indistinguishable from an integer). Fixed centrally in `common/serialization/camel-case.ts` (the same global response-shaping interceptor B2 added for camelCasing): every `Prisma.Decimal` encountered is now rendered via `.toFixed(2)`. This is schema-wide safe, not a guess for this one field — every `@db.Decimal(...)` declaration in the entire frozen schema uses scale 2, verified directly (`Decimal(5,2)`, `Decimal(10,2)`, `Decimal(12,2)` — the precision varies, the scale never does). **This retroactively fixes the same latent bug in B2's `Deal.estimatedValue`**, which B2's own tests never asserted on the exact string shape of and so never caught — a real, if minor, gap in B2's test coverage, closed as a side effect of this phase's testing.

## C. Proposal versioning

`unique(organization_id, deal_id, version)` is respected exactly as declared. Version 1 is assigned on create; `revise()` computes the next version as `MAX(version for this deal) + 1`, read inside a `$transaction`, with the **database constraint as the actual correctness guarantee**, not the read — see G below for the full reasoning and the concurrency test that proves it. A historical (non-DRAFT) version is never mutated by anything in this module: `update()`/`replaceLineItems()`/`send()` all reject with `409 PROPOSAL_IMMUTABLE` once a proposal has left DRAFT — Document 5 §6.1's own literal error code, used verbatim, not a paraphrase.

## D. Proposal lifecycle

State machine (`policies/proposal-state-machine.ts`) implements Document 5 §12.3 exactly: `DRAFT →(send)→ SENT →(transition)→ VIEWED|REJECTED|EXPIRED`, `VIEWED →(transition)→ REJECTED|EXPIRED`. No arbitrary `PATCH { status }` exists — `UpdateProposalDto` only ever accepts `terms`; sending a `status` field is rejected outright by `forbidNonWhitelisted` (400), not silently ignored. Every transition target not explicitly reachable from the current state is rejected `409 PROPOSAL_INVALID_TRANSITION` with `{from, to}` in `details`.

## E. Deal integration

Every `dealId` supplied on create is validated to belong to the caller's organization *before* being written (`assertDealInOrg`, a small self-contained copy of B2's `scope-guards.ts` pattern — kept local to `sales` rather than importing CRM's internal service file, since Document 5 §1's "may depend on crm" describes a module-boundary relationship, not license to reach into another module's private implementation files). A cross-org `dealId` on create is rejected `404` (no existence leak), verified by test.

## F. Accepted proposal behavior

**`ACCEPTED` is never reachable through any endpoint this phase implements.** Document 5 §6.1: "Accept primarily via portal"; §11: the sole acceptance endpoint is `POST /portal/proposals/:id/accept`, explicitly out of B3's scope (task section 16, "Do NOT implement... portal proposal acceptance"). The internal `/transition` endpoint's state machine simply never lists `ACCEPTED` as a reachable target from anywhere — an attempt returns a distinct `409 PROPOSAL_ACCEPT_IS_PORTAL_ONLY`, checked *before* the general transition-table lookup, from every state (DRAFT/SENT/VIEWED/already-ACCEPTED all rejected identically, verified by test). This mirrors B2's Deal-WON precondition situation exactly: the check/behavior is real and correct, but until a future Portal phase implements the actual accept endpoint, no proposal can ever become ACCEPTED through real product usage — only e2e test fixtures seed one directly (the same technique B2 used to test Deal WON before Sales existed). `revise()` is still permitted on an ACCEPTED proposal (matching the frontend's own `canReviseProposal`, which allows revise from any non-DRAFT status including ACCEPTED) — this creates an independent new DRAFT, it does not touch or duplicate the acceptance itself.

## G. Proposal revision

`POST /proposals/:id/revise` — only from non-DRAFT (`409 PROPOSAL_ALREADY_DRAFT` otherwise, since an already-DRAFT proposal is directly editable and revising it would be pointless), creates a new `version = MAX(version for deal) + 1` row at `DRAFT`, copies (snapshots) every line item onto independent new rows, and never mutates the source. **Concurrency is the real substance of this requirement, not a formality:** the version-number read is optimistic and *not* race-free on its own — two concurrent `revise()` calls against proposals on the same deal can both read the same `MAX(version)` before either commits. Correctness comes from the `@@unique([organization_id, deal_id, version])` constraint: at most one `INSERT` can win a given version number; the loser's transaction throws a Postgres unique-violation, caught and translated into a clean `409 PROPOSAL_REVISION_CONFLICT` rather than a raw 500 or (worse) a silently duplicated version. **Verified under real concurrent requests** (`Promise.all` of two simultaneous revises against the same source), run repeatedly to confirm it isn't flaky, plus a direct test that a raw duplicate-version `prisma.proposal.create()` fails at the DB with `P2002` — the constraint genuinely is the final backstop, not just an assumption.

## H. RBAC

No new permission was added — Document 5 §4.2's existing `sales.read`/`sales.manage` (already correctly granted in Phase 1's `permissions.ts`: FOUNDER_ADMIN wildcard, OPERATIONS/FINANCE `sales.read` only, SALES both, TEAM_MEMBER neither) already matches Document 6 §2.3's Proposals row exactly — the RBAC-granularity gaps B2 had to work around for Leads/Deals/Activities simply don't exist here, so no resource-authorization layer was needed for Proposals. Verified by test that FINANCE can read but not create/manage proposals (task section 9's explicit concern — "Finance must not automatically gain Sales permissions merely because it handles financial records" — was already true before this phase and is now test-verified, not just assumed).

## I. Organization isolation

Every query filters by `organization_id` from the session. `dealId` (create) and `taxRateId` (line items) are validated in-org before being written — the same nested-relation IDOR defense B2 established. Cross-org access to a Proposal, its Deal, or a cross-org `taxRateId` all return `404`. A cross-org proposal's line items are correspondingly unreachable, since the whole proposal 404s first (verified: both `GET` and `PUT .../line-items` on another org's proposal id).

## J. Transactions/concurrency

- **Create**: single insert, no transaction needed (no multi-row invariant on create).
- **`replaceLineItems`**: `$transaction([deleteMany, createMany])` — the full replace is atomic.
- **`revise`**: `$transaction` covering the version read, the new Proposal insert, and the line-item snapshot insert — atomicity for the write; the **unique constraint**, not the transaction's isolation level, is what actually prevents a duplicate version under concurrency (see G above; Postgres's default Read Committed isolation does not itself prevent two transactions from reading the same `MAX(version)`).
- **`send`/`transition`**: single update + audit write; no multi-row invariant requiring a transaction.

## K. Audit logging

Document 5 §12.3: "Audit all transitions (A)"; §19's per-route Audit column marks `send`, `revise`, and `transition` all Tier A, and `create`/`update (PATCH)`/`replaceLineItems (PUT)` all unmarked (no audit). Both documents agree once read precisely (Document 6 §17's Tier A list names "Proposal status" changes specifically — PATCH/PUT never change `status`, so they're correctly outside Tier A too). Implemented via the existing `AuditService` only — no new audit table, no bypass of the DB-level `REVOKE UPDATE, DELETE` grant. New action constants: `proposal.sent`, `proposal.transitioned`, `proposal.revised`.

## L. Security/red-team results

All 20 listed vectors tested against the real HTTP surface. Full mapping (which file/test covers which numbered item) is in the two e2e spec files' own doc comments; summary:

| # | Vector | Result |
| --- | --- | --- |
| 1 | Unauthenticated access | Pass — `401` |
| 2 | Unauthorized role | Pass — TEAM_MEMBER denied entirely, `403` |
| 3 | Cross-org Proposal IDOR | Pass — `404`, not in list either |
| 4 | Cross-org Deal IDOR | Pass — create against another org's deal → `404` |
| 5 | Cross-org line-item access | Pass — whole proposal 404s; `PUT .../line-items` also 404s |
| 6 | organization_id spoofing | Pass — rejected outright (`400`), never silently substituted |
| 7 | Mass assignment | Pass — `version`/`status`/`createdBy` all rejected on create |
| 8 | Malformed UUID | Pass — every `:id` route, `400` not `500` |
| 9 | Invalid lifecycle transition | Pass — DRAFT-via-transition, skip-to-ACCEPTED, post-terminal all `409` |
| 10 | Arbitrary status PATCH | Pass — `400`, field not whitelisted |
| 11 | Immutable proposal mutation | Pass — PATCH/PUT after SEND both `409 PROPOSAL_IMMUTABLE` |
| 12 | Duplicate revision | Pass — two sequential revises of the same frozen source both succeed with distinct versions (2, 3), never colliding |
| 13 | Concurrent revision | Pass — real `Promise.all`, stable across repeated runs |
| 14 | Invalid acceptance | Pass — `to: ACCEPTED` rejected from DRAFT/SENT/VIEWED alike |
| 15 | Duplicate/invalid acceptance | Pass — an already-ACCEPTED proposal rejects re-accept, any other transition, and PATCH — fully immutable |
| 16 | Unauthorized revision | Pass — `403` without `sales.manage` |
| 17 | Unauthorized lifecycle action | Pass — send/transition both `403` without `sales.manage` |
| 18 | Historical version integrity | Pass — editing the *new* draft's line items after revise never touches the frozen source's snapshotted lines |
| 19 | `unique(deal_id, version)` | Pass — direct duplicate insert fails `P2002` at the DB |
| 20 | Audit record creation | Pass — send/transition/revise each produce a distinct, correctly-attributed `AuditLog` row |

## M. Exact test counts

**34 unit** (unchanged — no new unit tests needed, Proposal logic is exercised end-to-end) + **137 e2e** (106 pre-existing, re-verified unchanged, + **31 new**: 19 in `sales-proposals.e2e-spec.ts`, 12 in `sales-proposals-security.e2e-spec.ts`) — confirmed together in one full run immediately after implementation, and the 31 new tests individually re-confirmed stable across repeated runs (including the concurrency test, 3x). See N below for the commit-time re-verification caveat.

## N. Regression results

**Full clean run, captured during implementation:** `npm run typecheck:api`, `npm run build:api`, `npx eslint` (0 errors on every file this phase touched — the shared 259-warning baseline unchanged), and the complete test suite (34 unit + 137 e2e, all green) were all confirmed together, in that state, before this document was written.

**An important, fully-disclosed caveat:** a second, in-progress backend phase (**B4 Projects** — not requested of or authored by this session) began landing concurrently in the same working tree partway through this phase's own verification. By the final regression pass, `apps/api/src/modules/projects/` (new, untracked, not touched by this phase) had been wired into `app.module.ts` and briefly contained a genuine mid-edit syntax error (`projects.service.ts`, a method signature caught mid-write). Because `AppModule` is imported by every single e2e test file, this made the *entire* suite fail to even load — including tests wholly unrelated to B3 (e.g. `rbac.e2e-spec.ts`, `audit.e2e-spec.ts`). This was verified precisely, not assumed: every failing suite's error pointed at the exact same line in a file this phase never touched, confirmed via `npx tsc --noEmit` listing only `modules/projects/*` files, and confirmed again a few minutes later that `app.module.ts` had just gained a `ProjectsModule` import it didn't have earlier in this same phase. **This is a live multi-process collision, not a regression this phase introduced** — this phase's own files (`modules/sales/**`, the `common/` additions, its own slice of `app.module.ts`/`audit.service.ts`) were independently typecheck/lint/build-clean before the collision began, and remain so (verified via `npx tsc --noEmit` / `npx eslint` scoped to exactly the files this phase changed, both clean). The git-safety handling for this — including how `audit.service.ts`, modified by *both* phases in the same file, was staged so this phase's commit contains only its own lines — is in R below.

## O. Files changed

**New:** `apps/api/src/modules/sales/**` (1 controller, 1 service, 1 DTO file, 1 state-machine policy file, 1 scope-guards helper, `sales.module.ts`), `apps/api/test/sales-proposals.e2e-spec.ts`, `apps/api/test/sales-proposals-security.e2e-spec.ts`, `apps/api/test/support/sales.ts`, this document.

**Modified:** `apps/api/src/app.module.ts` (registers `SalesModule`), `apps/api/src/common/serialization/camel-case.ts` (the Decimal-formatting fix, benefits every module including B2's already-shipped `Deal.estimatedValue`), `apps/api/src/common/validation/money.ts` (adds `IsQuantityString`/`QUANTITY_REGEX`), `apps/api/src/modules/shared/audit.service.ts` (adds three `PROPOSAL_*` action constants — **this phase's commit contains only those three lines**; the file also independently gained nine `PROJECT_*`/`MILESTONE_*`/`TASK_*` constants from the concurrent B4 work, deliberately excluded from this commit — see R).

## P. Prisma/schema status

**Unchanged.** `git diff --stat prisma/schema.prisma` is empty, confirmed both before writing any code and at completion.

## Q. Migration status

**Unchanged.** `git diff --stat prisma/migrations/` is empty. No `prisma migrate`/`db push`/`migrate reset` command was run.

## R. Frontend untouched confirmation

`apps/web/**` was not edited by this phase (read-only inspection of `apps/web/src/features/sales/**` to confirm contract alignment — no discrepancy found, see Step 1 above). `apps/web/src/features/portal/**` continues to show as modified in `git status` — the same unrelated, in-progress Client Portal frontend work already present before this phase began, still correctly left uncommitted.

**A second kind of "untouched confirmation" this phase needed, not anticipated by the template:** `apps/api/src/modules/shared/audit.service.ts` was concurrently modified by the in-progress B4 Projects backend work (see N above) in the *same file* this phase also needed to touch (adding audit-action constants). Since both changes landed in one contiguous block with no file boundary to separate them, a plain `git add` of this file would have swept B4's nine constants into this B3 commit. Handled surgically: the last-committed (B2) version of the file was reconstructed with only this phase's three-line addition applied, hashed as a git blob (`git hash-object -w`), and staged directly into the index for this path (`git update-index --cacheinfo`) — without touching the working-tree file at all, so the concurrent B4 edits remain exactly as that process left them, uncommitted, on disk. Verified via `git diff --cached` (shows only the three `PROPOSAL_*` lines) and `git diff` (shows only the nine `PROJECT_*`/`MILESTONE_*`/`TASK_*` lines remaining unstaged) before committing.

## S. Marketing repo untouched confirmation

Confirmed: `git status` in `/Users/atharva/Forge` is identical to its state before this phase began.

## T. Commit hash

Recorded in the final report once created — this document is written before the commit, per the established git-safety ordering.

## U. Remaining limitations/open decisions

1. **No proposal can become ACCEPTED through any endpoint this phase (or B2) implements** — by design (see F above), not a gap to silently fill; whoever builds the Portal phase needs `POST /portal/proposals/:id/accept` to close this loop.
2. **`revise()`'s optimistic version read + unique-constraint backstop** is the correct, verified-safe pattern, but under sustained heavy concurrent revision traffic on the same deal (unlikely at this team's scale — Document 1: 5-person studio) a losing request simply gets a `409` and must retry client-side; no server-side retry loop is implemented, since the task's own emphasis was on correctness (never a duplicate/corrupt version), not retry ergonomics.
3. **`Decimal` scale-2 formatting fix** assumes every `Decimal` column in the schema is scale 2 — true today (verified against every declaration), but a future migration adding a differently-scaled `Decimal` field would silently get formatted to 2 places too. Worth a comment/test if that ever changes; not a concern against the current frozen schema.
4. **The B4/B3 concurrent-file-editing situation** (N and R above) — a coordination note for whoever manages multi-phase parallelism on this project going forward, not a defect in either phase's own code.

## V. Frozen-architecture conflicts

**None found.** Every requirement in Documents 5/6 relevant to B3 was implementable exactly as specified against the frozen schema — unlike B2, which found one genuine schema-blocked conflict (Lead's "first Activity" auto-transition), this phase's own close reading of Document 5 §6.1/§12.3/§19 against the actual `Proposal`/`ProposalLineItem` models turned up no such gap. The one true finding this phase produced — the `Decimal` trailing-zero serialization bug — is a code defect (now fixed), not an architecture conflict: nothing about it required a schema or Document 5/6 interpretation change, only a correction to how an existing, correctly-typed field was being rendered onto the wire.

---

**IMPLEMENTATION PHASE B3 COMPLETE**
