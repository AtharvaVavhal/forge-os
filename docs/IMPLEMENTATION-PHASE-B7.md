# FORGE Business OS — Implementation Phase B7: Client Portal

**Status:** Implemented against Document 5 §11 / §19 and Document 6 §§1, 5, 9–10, 13–14. Verified with dedicated portal e2e suite against real PostgreSQL.
**Scope:** ClientUser authentication plane (`portal_session` / `aud: portal`); company-scoped read models for projects, proposals, invoices, documents; proposal acceptance; Razorpay checkout start; support ticket create/list. **No Prisma migrations.** Ends at Proposal `ACCEPTED` — no Deal-Won orchestration.

---

## Architecture & Design Overview

B7 registers `PortalModule` with a separate auth plane from internal B1:

| Concern | Internal | Portal |
| --- | --- | --- |
| Cookie | `forge_session` | `portal_session` |
| JWT `aud` | `internal` | `portal` |
| Identity | `User` | `ClientUser` |
| Scope | org + RBAC roles | org + **company_id** |

- `JwtAuthGuard` skips `/portal/*` paths.
- `PortalAuthGuard` (global) authenticates portal routes; `@Public()` on login only.
- CSRF reuses `forge_csrf` / `X-CSRF-Token` on mutating portal routes.
- Logout clears cookies and bumps `ClientUser.updated_at` (security-stamp invalidation).

### Key artifacts

- `apps/api/src/modules/portal/` — controllers, services, guards, DTOs
- Minimal B0–B6 wiring only:
  - `JwtAuthGuard` portal-path skip
  - `AuthModule` exports `PasswordService`
  - `FinanceModule` exports `RazorpayOrdersService` + `createOrderForPortalInvoice`
  - `AUDIT_ACTIONS` portal + `proposal.accepted`
- Tests: `apps/api/test/portal.e2e-spec.ts` + `test/support/portal.ts`

---

## Implemented Routes (exactly 16)

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/portal/auth/login` | Public + rate limit |
| POST | `/portal/auth/logout` | CSRF; stamp bump |
| GET | `/portal/me` | Active ClientUser |
| GET | `/portal/projects` | company-scoped |
| GET | `/portal/projects/:id` | safe fields |
| GET | `/portal/projects/:id/milestones` | RO |
| GET | `/portal/projects/:id/handover` | checklist summary |
| GET | `/portal/proposals` | excludes DRAFT |
| GET | `/portal/proposals/:id` | SENT→VIEWED + audit |
| POST | `/portal/proposals/:id/accept` | SENT\|VIEWED→ACCEPTED; DomainEvent; no Deal WON |
| GET | `/portal/invoices` | excludes DRAFT |
| GET | `/portal/invoices/:id` | lines + non-pending payments |
| POST | `/portal/invoices/:id/pay` | Razorpay order start only |
| GET | `/portal/documents` | `CLIENT_VISIBLE` + not deleted + company parent |
| GET | `/portal/documents/:id/download-url` | signed URL |
| GET/POST | `/portal/support-tickets` | create rate-limited |

**Not in B7:** maintenance portal, notes, notifications APIs, ticket replies, document upload/delete, milestone approve, Deal-Won automation, password reset/magic-link.

---

## Authorization

Every resource resolves through `ClientUser.organization_id` + `ClientUser.company_id` via parent chain (project / invoice / deal / document parents). Cross-company / cross-org → **404**. Request body `organizationId` / `companyId` / actor ids are never trusted.

---

## Audit

| Action | When |
| --- | --- |
| `portal.auth.login_*` | Login success / fail / inactive |
| `portal.auth.logout` | Logout |
| `proposal.transitioned` | SENT→VIEWED on GET |
| `proposal.accepted` | Accept |

---

## Explicitly deferred

DomainEvent **insert** on accept is implemented; consumer worker remains deferred (same as B2–B6). Portal notification listing APIs not in Doc 5 §11 inventory.
