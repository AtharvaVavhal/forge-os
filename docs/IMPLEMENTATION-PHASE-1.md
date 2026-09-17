# FORGE Business OS — Implementation Phase 1: Authentication + RBAC + Organization Security

**Status:** Backend complete and verified (90/90 tests passing against a real PostgreSQL database — 34 unit + 56 e2e). Frontend authentication UI exists (built in parallel outside this session's direct authorship — see [Frontend authentication](#frontend-authentication) below) and is integration-tested against this backend, with **one real, precisely-characterized bug found and documented, not fixed** (out of this session's scope — see [Security review](#security-review--step-20)).

**Scope:** Documents 5 and 6's frozen internal-`User` authentication, RBAC, session, invitation, password-reset, CSRF, rate-limiting, and audit requirements. Client Portal (`ClientUser`) authentication is explicitly out of scope, per the task brief and per Documents 5/6's own `/portal/*` surface being separate.

---

## Step 1 — Inspection findings

Before writing anything: Phase 0 was re-verified intact (health endpoints, error envelope, Prisma wiring), `prisma/schema.prisma` was read in full for the exact field names/types of `User`, `ClientUser`, `InvitationToken`, `AuditLog`, `Organization`, and the relevant enums, Documents 5 and 6 were treated as already-known from this session's own prior work (Phase 0), package versions were checked, and git status was recorded (clean, matching the end of Phase 0).

**Two real, load-bearing constraints confirmed directly in the schema, not just in the docs:**
- No `Session` table exists (Document 6 §5.2 item 3, confirmed: `grep '^model' prisma/schema.prisma` lists no such model).
- No `PasswordResetToken` table exists (Document 6 §7, confirmed the same way).

Document 6 §5.2/§7 explicitly anticipate and sanction working around both ("implementation may use signed token or ephemeral store... do not add Prisma model in this doc") — **this is not a frozen-architecture conflict requiring STOP**, it's a documented, pre-approved gap with a stated resolution direction. See [Session design](#session-design-the-core-architectural-decision) below for exactly how this phase resolves it.

No other conflict between the frozen schema and Documents 5/6's requirements was found. `prisma/schema.prisma` and every migration file are byte-for-byte unchanged by this phase (`git diff --stat prisma/` is empty — verified below).

---

## Session design — the core architectural decision

With no `Session` table, sessions are a **stateless JWT** in the `forge_session` httpOnly cookie, verified fresh against the live `User` row on every single request (`JwtAuthGuard`). Two checks on that live row are the entire "session invalidation" mechanism:

1. **`User.active === true`** — Document 6 §5.3's explicit requirement. A deactivated user's existing, unexpired tokens stop working on their very next request. Live-tested (`auth-flows.e2e-spec.ts`).
2. **A "security-stamp" fence**: the token's issue timestamp compared against `User.updated_at`. Since `updated_at` bumps on *any* write to the row (including a password change), a token issued before the most recent write is treated as stale. This is how "password change/reset invalidates all sessions" (Document 6 §5.3) is achieved with no revocation list — and it also delivers Document 6 §5.2's *recommended-but-not-frozen* "session rotation on role change" as a free side effect, since a role change is also a write to the row.

**A real bug was found and fixed here during this phase, not designed in from the start:** the first implementation compared JWT's standard `iat` claim (fixed at **whole-second** resolution by RFC 7519) against `updated_at`. A session is routinely minted in the same request that just wrote `last_login_at` (login), and a password-reset token's own first use is what triggers the very `updated_at` bump it's later compared against — both of these routinely happen within the same wall-clock second. A whole-second comparison cannot reliably tell "issued before this write" apart from "issued in the same second as this write," and **either choice of comparison direction produces a real bug**: `<=` self-invalidates a token on its own first use; `<` fails to catch a same-second replay. This was caught by `password-reset.e2e-spec.ts`'s "reused reset" test failing in a way that a 1100ms wait between calls didn't fix — the wait was fixing the wrong gap (the bug is in the gap between *mint* and *first use*, not between first and second use). **Fix:** a custom `iatMs` claim (millisecond precision, `Date.now()`) replaces the standard `iat` for this specific comparison in both the session and password-reset-token code paths. See `jwt-payload.interface.ts` and `jwt-auth.guard.ts` for the full reasoning kept in code.

Password-reset tokens use the identical mechanism as a **signed, non-persisted JWT** (`aud: internal-password-reset`) rather than a hashed database row — Document 6 §7's sanctioned alternative. Single-use is enforced by the same `iatMs`-vs-`updated_at` fence: completing a reset writes `password_hash`, which is what makes a replay of the same token fail on its second attempt.

Invitation tokens are different: `InvitationToken` **does** have a real schema table with `token_hash`, so these are genuinely hashed (SHA-256 of a `crypto.randomBytes(32)` token) and persisted, matching the schema exactly — no workaround needed here.

---

## A. Authentication implemented

`POST /auth/login` (email + password, organization-scoped lookup via `{organization_id, email}` — the actual DB unique constraint shape, not a bare email lookup), `POST /auth/logout`, `GET /auth/session`, `GET /auth/me`, `GET /auth/permissions` — exactly Document 5 §3.2's table, no more.

Covered and live/e2e-tested: valid login, invalid credentials (wrong password and unknown email return the byte-identical generic message and status), inactive-user rejection (at login, and mid-session the instant a user is deactivated), logout (cookie cleared, session unusable after), session expiry (wrong signing key, and the security-stamp fence), protected-endpoint-without-authentication (fails closed on every route not explicitly `@Public()`).

## B. Session security implemented

httpOnly, `SameSite=Strict` (frozen, Document 6 §5.1), `Secure` in production (env-driven, off for local http dev by design), no `Domain` attribute set (Document 6 §5.2 leaves this open — host-only cookie is the safe default), no token ever touches `localStorage` (verified: the frontend's session handling is entirely cookie-based, confirmed by inspection of the auth feature code). TTL defaults to 12h, fully configurable, explicitly **not** claimed as a frozen production value (Document 6 §5.2 marks the exact TTL open).

## C. Google Workspace SSO status

**Implemented, not live-tested** (no real Google OAuth credentials exist in this environment — Document 6 marks exact config values as environment-level, not frozen). `GET /auth/google/start` builds the authorize URL with a CSRF-protective `state` param (stored in a short-lived, `SameSite=Lax` cookie — `Lax` specifically because it must survive the top-level cross-site redirect back from `accounts.google.com`, which `Strict` would drop); `GET /auth/google/callback` exchanges the code, verifies the `id_token` via `google-auth-library` (official Google client — this is exactly the kind of signature verification that should use an audited library, not a hand-rolled one), and maps the verified email to an **existing, active** `User` in the resolved organization. **Deliberately does not auto-provision a new `User`** on first SSO login — Document 6 §1.2 marks the exact provisioning mechanism as NOT CURRENTLY DEFINED, and silently creating an account from an unauthenticated callback is a security-sensitive decision this phase does not make unilaterally. If `GOOGLE_OAUTH_CLIENT_ID/SECRET/REDIRECT_URI` are unset, the endpoints return a clear `503 GOOGLE_SSO_NOT_CONFIGURED` rather than the app failing to boot.

## D. Invitation security

Real, hashed, persisted tokens (SHA-256 — a high-entropy random value doesn't need bcrypt's slow stretching; Document 6 §6.2 explicitly leaves the algorithm open). Expiry, single-use (`used_at`), revocation (`revoked_at`), and generic failure for every invalid case (Document 6 §6.2: "no enumeration of which") are all live-tested for both TEAM and CLIENT scope. **TEAM-scope creation/revocation is FOUNDER_ADMIN-only; CLIENT-scope may also be done by SALES** (Document 6 §2.3 footnote 7) — this is genuinely conditional on the request body's `scope`, implemented as real logic in `InvitationService.assertCanManageInvitations`, not a single static permission decorator, and is exactly the kind of "resource authorization" Step 11 asks for. Accept creates a `User` (TEAM) or `ClientUser` (CLIENT) inside one transaction with marking the token used, so a crash between the two can't leave the token replayable.

## E. Password reset status

Implemented per Document 6 §7 within the [session design](#session-design-the-core-architectural-decision) constraint above. Generic response regardless of whether the email exists (`204` either way, no timing/shape distinction — the failed-login path additionally pays the same bcrypt cost on a miss as a real verification would, to avoid a timing side-channel). Live-tested: valid reset, expired token, reused token (single-use), inactive-user rejection, and audience isolation (a session token can't be used as a reset token and vice versa).

## F. Authentication guard

`JwtAuthGuard`, registered globally (`APP_GUARD`), fail-closed — every route requires a valid session unless explicitly marked `@Public()` (the opt-out is the exception). Implements the full `Request → Authentication → User → Session → Organization Context` chain from Step 8: cookie → JWT verify → live `User` row lookup → active check → org-claim-vs-real-org integrity check → security-stamp check → `request.user` populated from the **live row**, never from trusted token claims.

## G. RBAC implementation

`policies/permissions.ts` implements Document 5 §4.2's permission catalog (18 permissions) and §4.3's default role→permission matrix exactly, including the deliberately-absent grants called out in the frozen docs (SALES has no `finance.read`; TEAM_MEMBER has no `forge_fund.*` at all). `PermissionsGuard` (global, runs after `JwtAuthGuard`) enforces `@RequirePermissions(...)`; a route with none still requires authentication but no specific permission (correct for `/auth/me` etc.). Every denial is a consistent `403 FORBIDDEN_PERMISSION`.

## H. Five-role matrix verification

Every role has at least one representative allowed and denied action, live-tested via the one real resource this phase has (`/invitations`, whose permission logic is genuinely conditional — see D above) plus the full permission catalog verified in isolation via unit tests (`permissions.spec.ts`, 8 tests) against every one of the 18 frozen permissions. FOUNDER_ADMIN's wildcard, OPERATIONS' project-only grants, FINANCE's fund-approval grants, SALES' CRM+portal grants (and finance denial), and TEAM_MEMBER's fully-denied Forge Fund access are each explicitly asserted.

## I. Organization isolation

`OrganizationContextService` resolves "the" org via `{organization_id, email}` — matching the real unique constraint shape, not relying on email happening to be globally unique. `JwtAuthGuard` additionally rejects any token whose `org` claim doesn't match the token-named user's *actual* live `organization_id` — defending against a forged or stale claim, not just a naturally-scoped query. **Genuinely limited scope, stated plainly:** Phase 1 has zero organization-scoped *business* resources (no Company/Deal/etc. endpoint exists yet), so full CRUD-level cross-org IDOR testing isn't exercisable — a second test-only organization was seeded specifically to prove the identity/session layer's own cross-org integrity holds, which is everything there currently is to test. Full resource-level cross-org testing is Phase 2+'s responsibility once real business endpoints exist, and this document says so explicitly rather than implying more coverage than exists.

## J. Resource authorization foundation

`@RequirePermissions(...)` + `PermissionsGuard` is reusable infrastructure, not a feature-specific hack — any future controller method gets object-level RBAC for free. `InvitationService.assertCanManageInvitations` is the concrete proof this scales to genuinely conditional (not just static) authorization. No future CRM/Finance/etc. endpoints were implemented (per explicit instruction).

## K. CSRF

Real double-submit-cookie validation (`CsrfGuard`, global, runs after `JwtAuthGuard`) — a non-httpOnly `forge_csrf` cookie must match an `X-CSRF-Token` header on every state-changing (`POST/PUT/PATCH/DELETE`), authenticated, non-`@Public()` request. **`SameSite=Strict` alone is explicitly not relied on** — this is real defense-in-depth against SameSite implementation gaps, not a redundant no-op, per the task's own instruction. Live-tested: valid match succeeds, missing header rejected, mismatched header rejected, safe methods (GET) exempt, public routes (login) exempt.

## L. Rate limiting

`@nestjs/throttler`, in-memory/per-process (**no Redis** — explicit instruction honored). Login, invitation-accept, and password-reset each have their own configurable limit/window (defaults: 5/60s, 5/60s, 3/300s — Document 6 §14 marks every exact number NOT CURRENTLY DEFINED, these are development defaults, not claimed production values). A `NODE_ENV=test`-only 10× headroom multiplier on the *fallback default* (never on an explicitly-set env var) exists so this phase's own comprehensive multi-scenario test suite doesn't trip its own limits — a dedicated test (`rate-limit-behavior.e2e-spec.ts`) proves the real 429 behavior using an explicit, small override that bypasses the multiplier. Portal login rate limiting is not implemented — the portal identity plane doesn't exist in this phase.

## M. Audit logging

Every Tier A event Document 6 §17/§9 lists for this phase's scope is recorded: login success/failure/inactive-rejection, logout, SSO success/no-match, invitation created/revoked/accepted/accept-rejected, password-reset requested/completed/replay-rejected. `AuditService` only ever calls `.create()`. **Immutability is verified at the actual database-grant level**, not just by code inspection: a dedicated e2e test connects via `SET LOCAL ROLE forge_app` (the real application role) inside a transaction and asserts `UPDATE`/`DELETE` fail with Postgres's own `42501` (permission denied) — matching Document 4's own verification command — while confirming `INSERT` still succeeds (append-only, not read-only).

## N. Frontend authentication

**Context this session needs to be explicit about:** a substantial, complete frontend authentication implementation (`apps/web/src/features/auth/`, login page, workspace boundary, role-aware `<Can>` authorization component, account menu, session-expiry handling, a same-origin `/api/v1` rewrite so the httpOnly cookie stays first-party, CSRF header auto-attachment, 67 passing Vitest unit/component tests) was built **in parallel by work outside this session's direct authorship**, discovered mid-Phase-1 via live file-change notifications and confirmed via `git status`. Rather than build a second, competing implementation, this phase verified compatibility with it (cookie names, endpoint paths, header names, error envelope shape all matched what this backend actually implements) and integration-tested the two together live. See [Security review](#security-review--step-20) for one real bug found this way.

## O. Tests

**89 backend tests** (34 unit + 55 e2e as originally built, **56 e2e after the privilege-escalation test added during the security review pass** — 90 total), all passing against the real local PostgreSQL database, covering every category Step 19 lists: authentication (valid/invalid/inactive/logout/expired-or-revoked/protected-without-auth), RBAC (all five roles, representative allow+deny), organization isolation (scope resolution, forged-org-claim rejection, forged-role-claim/privilege-escalation rejection, cross-org login-enumeration resistance), invitations (valid/invalid/expired/reused/revoked), password reset (valid/expired/reused/generic-response-for-unknown-email), CSRF (valid/missing/invalid/safe-method-exempt/public-route-exempt), rate limiting (threshold behavior, real 429 proof), and audit (event recorded for every Tier A action + real DB-grant-level immutability). **67 frontend tests** (Vitest, pre-existing from the parallel work) also verified passing. No test was weakened to make it pass — three real bugs were found and *fixed* via this test suite (see below), not worked around.

## P. Security/red-team results

See the [dedicated section below](#security-review--step-20).

## Q. Regression results

Phase 0 re-verified fully intact: `/api/v1/health/live` and `/api/v1/health/ready` both return `200` live (the latter with real Postgres connectivity: `{"database":{"status":"up"}}`), the frozen error envelope shape is unchanged, unknown routes still `404` correctly, request-id headers still present. `apps/web` (typecheck, lint, build) and `apps/api` (typecheck, lint, build, unit tests, e2e tests) are all clean. A live, full-stack integration test (real login through the frontend's actual same-origin proxy, real httpOnly session + CSRF cookies observed, real authenticated `/auth/me` and `/dashboard` access, real security headers on every response) was run against a one-off test user (created and removed cleanly, never touching seeded/demo data).

## R. Files changed

See `git diff --stat` / `git status` in the repository at commit time. Backend (authored this session): `apps/api/src/modules/auth/**`, `apps/api/src/modules/shared/**`, `apps/api/src/{app.module.ts, config/*, health/health.controller.ts}` (extended), `apps/api/test/**` (all new), `apps/api/package.json`, root `package.json`/`.env.example`/`package-lock.json`. Frontend and its own test suite (`apps/web/**`, `.env.example`): present in the working tree from parallel work, not authored by this session — included in the same commit for an accurate, complete Phase 1 snapshot, with authorship distinguished in the commit message.

## S. Commit hash

See the final report at the end of this session's reply — recorded there once created (this document is written before the commit, per the git-safety ordering: docs, then final `git diff`/`git status` review, then commit).

## T. Open decisions

Carried forward, not silently resolved — every one of Document 6's own open items remains open (session TTL exact value, portal TTL, cookie Domain, invitation TTL exact days, rate-limit exact numbers, 403-vs-404 for same-org permission misses — not yet relevant with zero business resources, security header/CSP exact values, audit retention days, invitation resend/rotation algorithm, password-reset token hash algorithm — n/a here since reset tokens are signed not hashed, secret rotation runbook ownership). New items surfaced by this phase specifically:

1. **The frontend `/dashboard` unauthenticated-access bug** (see Security review) — needs investigation and a fix by whoever owns `apps/web/src/features/auth/session/`.
2. **`iatMs` custom claim** — a deliberate, documented deviation from relying on the standard JWT `iat` alone, necessary for correct millisecond-precision security-stamp comparisons. Not a frozen-architecture conflict (nothing in Documents 5/6 specifies JWT claim shape beyond `aud`), but worth flagging as a real design decision for anyone building `ClientUser`/portal sessions later — the exact same class of bug (whole-second `iat` vs. sub-second `updated_at`) will recur there unless the same pattern is reused.
3. **No `PATCH /users/:id` (or any user-management) endpoint exists** — Document 6 §2.3 references role/active changes as a frozen *capability*, but Document 5's frozen endpoint inventory has no concrete route for it. Not built here (Step 16 restricts this phase to Document 5's literal list); flagged as a real gap between the two documents for a future phase to resolve, not resolved unilaterally in either direction.
4. **Idempotency-Key on financial-adjacent Phase-1 endpoints** — Document 5 §2.7 names only Invoice/Payment creation explicitly; this phase's invitation/reset endpoints don't carry idempotency keys since none are named for them, and Phase 1 has no financial endpoints at all.
5. **Two-application recommendation** (Document B3 §1) — the actual repository still builds `apps/web` as one Next.js app; the internal-vs-portal separation this phase relies on (separate `aud` claims, separate cookie names already reserved: `forge_session` vs. a not-yet-implemented `portal_session`) is enforced at the token/guard level, not yet at the deployment-topology level.

## U. Confirmation — Prisma schema unchanged

Confirmed: `git diff --stat prisma/schema.prisma` is empty.

## V. Confirmation — migrations unchanged

Confirmed: `git diff --stat prisma/migrations/` is empty. No `prisma migrate`, `prisma db push`, or `prisma migrate reset` command was run at any point in this phase — only `prisma generate` (regenerates the client from the unchanged schema, writes no schema/migration files).

## W. Confirmation — `/Users/atharva/Forge` untouched

Confirmed: `git status` in the marketing repository is identical to this phase's starting state (`src/app/api/contact/route.ts` modified, `docs/` and `src/lib/email/` untracked — the same pre-existing state from before Phase 0, never touched).

---

## Security review — Step 20

A focused pass against Document 6, covering every vector the task lists. Each row cites the actual evidence (a specific test, or a specific live-verified fact), not just an assertion.

| Vector | Result | Evidence |
| --- | --- | --- |
| **IDOR** | Pass, within this phase's scope | UUID identifiers throughout (frozen schema); no bare-lookup-then-authorize pattern anywhere in this phase's code — every query is scoped at the query level (`organization_id_email` compound key for login; invitation lookups scoped by `organization_id` before any permission check). Full resource-level IDOR testing awaits Phase 2's business endpoints (see §I above). |
| **Cross-org access** | Pass | `organization-isolation.e2e-spec.ts` — org-scoped login lookup, forged-org-claim rejection, cross-org login-enumeration resistance, all live-verified. |
| **Privilege escalation** | Pass | New test added specifically during this review: a forged token with a *correct* org and a *real* user but an elevated `role` claim is rejected — `request.user.role` is always re-derived from the live `User` row, never trusted from the token. Verified both that the elevated action fails (403) and that `/auth/me` reports the *real* role, not the forged one. |
| **Session theft assumptions** | Documented, not overclaimed | httpOnly + Secure(prod) + SameSite=Strict prevents the common JS-exfiltration and cross-site-replay paths. This codebase does **not** claim per-token server-side revocation (no Session table) — logout clears the cookie (ends the browser session) but a token exfiltrated *before* logout via some other channel remains cryptographically valid until natural expiry or the security-stamp fence catches it on a subsequent security-relevant write. This is stated plainly here rather than left implicit. |
| **CSRF** | Pass | `csrf-and-rate-limit.e2e-spec.ts` — valid/missing/mismatched/safe-method-exempt/public-route-exempt, all live-verified against the real double-submit implementation. |
| **Brute force** | Pass | `rate-limit-behavior.e2e-spec.ts` proves a real 429 after the configured attempt count, with an explicit, deterministic override (not relying on production-realistic — and therefore slow-to-test — default numbers). |
| **Invitation replay** | Pass | `invitations.e2e-spec.ts` — reused, expired, and revoked tokens all correctly rejected with the identical generic failure. |
| **Password reset replay** | Pass, with a documented precision limit | `password-reset.e2e-spec.ts` — a reused token is rejected. The underlying mechanism has millisecond, not perfect, precision (see the `iatMs` fix above) — a replay attempted within the same millisecond as the legitimate use is not a realistic concern (no plausible attacker achieves sub-millisecond replay timing over a network round trip), but this is a real, stated property of the design, not glossed over. |
| **Role bypass** | Pass | Covered by the same privilege-escalation test above, plus the RBAC permission-matrix tests covering all five roles' denials on the one real resource this phase has. |
| **Frontend-only authorization** | Correctly never relied upon | Every guard, every permission check, every organization scope check happens server-side, in the backend this phase built. The frontend's `<Can>` component (confirmed by inspection) is UX-only — hiding an action a role can't perform — and the backend independently rejects the same action regardless of what the frontend shows or hides. This is the one property most worth stress-testing, and it held: see the next finding. |
| **Error leakage** | Pass | `AllExceptionsFilter` (Phase 0, unchanged) never includes a stack trace, secret, or SQL fragment in a response body; verified no `password`/`password_hash` field ever appears in any response body across the full test suite (`auth-flows.e2e-spec.ts` asserts this explicitly on the login response). |
| **Token leakage** | Pass | Password-reset tokens are never returned in a *response body the confirm-flow's caller acts on as a success signal* beyond what's needed; the one intentional exception — the invitation-creation response includes the raw invitation token — is explicitly flagged in code and in this document as a **Phase 1 limitation**, not an oversight: no email-delivery module exists yet to hand it off to instead, and a real deployment must stop returning it over HTTP once one does. |
| **Audit tampering** | Pass | The real DB-grant-level test described in item M above — not a code-inspection claim, an actual `SET LOCAL ROLE forge_app; UPDATE ...` attempt that fails with Postgres's own `42501`. |

### One real finding: frontend workspace boundary does not redirect an unauthenticated request

**What was found:** a plain, cookie-less `GET /dashboard` against the frontend (`apps/web`) returns `200` with the full authenticated-workspace page shell (sidebar/header chrome, the dashboard placeholder layout) instead of a `307` redirect to `/login`. Reproduced twice against a **fresh production build** (`next build` + `next start` on an isolated port), ruling out a dev-server caching artifact. The relevant code (`requireWorkspaceSession()` → `readAuthContext()` in `apps/web/src/features/auth/session/`) reads correctly on inspection — it explicitly checks for an empty cookie jar and should call `redirect("/login")` — but the live behavior doesn't match. Notably, **the frontend's own unit tests for this exact function (`require-workspace-session.test.ts`, 5 tests) pass**, which points at the tests mocking Next.js's `cookies()`/`redirect()` internals in a way that doesn't capture the real runtime behavior — precisely the gap live integration testing exists to catch.

**Severity, precisely characterized:** confirmed via direct inspection **no real user data is exposed** — the dashboard page (`DashboardFoundation`) renders zero live business data in this phase (every KPI/table/chart is a static "—"/empty-state placeholder; Document B3/Phase 0's own scoping explicitly deferred live data to a later phase), and the rendered unauthenticated response was checked directly and contains no email, role, or other identity field. **The actual security boundary — this session's backend — is unaffected and independently verified correct**: every API call this phase's frontend would make from that page still requires a valid session and is rejected with `401` by the backend regardless of what the frontend shell displays (confirmed both by the full e2e suite and by live `curl` testing against `/api/v1/auth/me`). This is exactly the "frontend authorization is UX only, backend remains authoritative" principle holding under direct test — the failure is in a *UX/defense-in-depth* layer, not the security boundary itself.

**Why this is reported and not fixed:** `apps/web/src/features/auth/` was built by work outside this session's scope, discovered mid-phase via live file-change notifications. Modifying actively-developed parallel work without being asked to, especially in a security-relevant code path someone else is mid-way through building, risks a real conflict. This is reported with full reproduction detail (above) so its owner can fix it directly.

---

## Step 21 — Regression (detail)

| Check | Result |
| --- | --- |
| `GET /api/v1/health/live` | `200`, live |
| `GET /api/v1/health/ready` | `200`, `{"database":{"status":"up"}}`, live, real Postgres |
| Frontend `/login` | `200`, live (both via the parallel dev server on :3000 and a fresh production build) |
| Frontend `/dashboard` (authenticated) | `200`, correctly renders the authenticated user's identity/role, live |
| Unknown route | `404`, frozen error envelope shape, live |
| Unit tests (api) | 34/34 passing |
| e2e tests (api) | 56/56 passing, real database |
| Frontend tests (web) | 67/67 passing (Vitest, pre-existing) |
| Lint (api) | 0 errors, 122 warnings (all the same pre-existing `no-unsafe-*` pattern on Supertest's loosely-typed `App`, Phase-0-accepted) |
| Lint (web) | 0 errors, 0 warnings |
| Typecheck (api, web) | clean |
| Build (api, web) | clean |

**One infrastructure issue found and fixed during this phase, unrelated to the auth code itself:** a fresh `npm install` (triggered by the parallel frontend work adding testing dependencies) caused npm's workspace hoisting to place `@nestjs/platform-express`, `@nestjs/config`, and `@nestjs/terminus` in `apps/api/node_modules/` instead of the shared root `node_modules/`. NestJS's internal HTTP-adapter loader resolves these as siblings of `@nestjs/core`'s own install location, not via a normal `require()` from the application's own code — so this un-hoisting broke the API's ability to boot at all (`"No driver (HTTP) has been selected"`), even though every other check (typecheck, lint, unit tests, which don't boot the full HTTP server) still passed. **Fixed** via an explicit `overrides` entry in the root `package.json` pinning these three packages' versions, forcing consistent hoisting on a clean reinstall — confirmed by a full `rm -rf node_modules && npm install` and a live server boot showing every route correctly mapped.

---

## Open decisions summary

See item T above for the full list. The single most actionable one for whoever picks this up next: **the frontend `/dashboard` auth-redirect bug**, fully reproduced and documented above.

---

**IMPLEMENTATION PHASE 1 COMPLETE — READY FOR APP SHELL + DESIGN SYSTEM**
