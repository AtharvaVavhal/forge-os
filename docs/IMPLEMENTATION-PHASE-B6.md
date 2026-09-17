# FORGE Business OS — Implementation Phase B6: Team + Shared Systems

**Status:** Implementation complete and verified against real PostgreSQL. B6 E2E suite green (41 tests). CRM / Sales / Projects / Finance regression e2e (174 tests) and unit tests (34) green. API typecheck, build, and full `lint:api` verified after wiring.
**Scope:** Document 5 §10 / §15 / §19 (Team directory & workload; Notes; Documents + presign/download/soft-delete; Notifications; Global Search; AuditLog query). Document 6 §2.3 / §17 (documents/notes RBAC, Tier A document delete, Tier B note visibility). Frozen Prisma schema — **no migrations**.

---

## Architecture & Design Overview

Phase B6 registers the Team module and expands the global Shared module with Notes, Documents, Notifications, Search, and Audit Logs query surfaces. Domain services already existed as untracked work; this phase completed Nest wiring (AppModule / SharedModule / AUDIT_ACTIONS / TEAM_MEMBER `team.workload.read`) without rewriting those services.

### Key Module Artifacts
- **Team:** `apps/api/src/modules/team/`
  - `TeamController` / `TeamService` — members directory + workload
- **Shared (B6 surfaces):** under `apps/api/src/modules/shared/`
  - `notes/` — create/list/patch; exactly-one parent; visibility Tier B audit
  - `documents/` — presign, register, download URL, soft-delete (+ local `StorageService`)
  - `notifications/` — own inbox + mark-read
  - `search/` — cross-entity `q=` search gated by module read permissions
  - `audit-logs/` — `audit.read` filtered query
- **Wiring:**
  - `TeamModule` imported by `AppModule`
  - `SharedModule` registers B6 controllers/providers while remaining `@Global()`
  - `AUDIT_ACTIONS.DOCUMENT_DELETED`, `NOTE_VISIBILITY_CHANGED`
  - `TEAM_MEMBER` gains `team.workload.read` (own-workload narrowing in service)
- **Testing:** `apps/api/test/team-shared.e2e-spec.ts` + `test/support/team-shared.ts`

---

## Implemented Routes

| Method | Path | Permission / Auth | Notes |
| --- | --- | --- | --- |
| GET | `/team/members` | Authenticated internal | Optional role/active filters |
| GET | `/team/workload` | `team.workload.read` | TEAM_MEMBER forced to self |
| GET/POST | `/notes` | Authenticated (documents.manage / all roles per Doc 6) | Exactly one parent FK |
| PATCH | `/notes/:id` | Authenticated + ownership/role rules | Visibility change → Tier B audit |
| GET | `/documents` | Authenticated | Soft-deleted excluded |
| POST | `/documents/presign-upload` | Authenticated | MIME/size validation |
| POST | `/documents` | Authenticated | Register after upload; one parent |
| GET | `/documents/:id/download-url` | Authenticated | Signed/local URL |
| POST | `/documents/:id/delete` | Authenticated | Soft-delete; Tier A audit |
| GET | `/notifications` | Authenticated | Own recipient only |
| POST | `/notifications/:id/read` | Authenticated | Own only; cross-user → 404 |
| GET | `/search` | Authenticated | `q` required; entity types permission-gated |
| GET | `/audit-logs` | `audit.read` | FOUNDER_ADMIN + FINANCE |

**Activities** remain under CRM (`/activities`) — not reimplemented in B6.

---

## RBAC Highlights

| Capability | FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER |
| --- | --- | --- | --- | --- | --- |
| Team members list | ✓ | ✓ | ✓ | ✓ | ✓ |
| Team workload | ✓ | ✓ | — | — | own only |
| Notes / Documents | ✓ | ✓ | ✓ | ✓ | ✓ (L⁴ own/assigned where enforced) |
| Notifications | own | own | own | own | own |
| Audit logs | ✓ | ✗ | ✓ | ✗ | ✗ |
| Search | ✓ (all readable types) | ✓ | ✓ | ✓ | ✓ |

Organization isolation: cross-org parents → `404`; search never returns other-org hits; audit-logs tenant-scoped.

---

## Audit Coverage

| Action | Tier | When |
| --- | --- | --- |
| `document.deleted` | A | Soft-delete via `POST /documents/:id/delete` |
| `note.visibility_changed` | B | PATCH changes `visibility` |

Uses existing append-only `AuditService` only.

---

## Verification & Test Results

### B6 E2E (`team-shared.e2e-spec.ts`)
- **Passed:** 41 / 41
- Suites: team members, workload RBAC, notes, documents, notifications, search, audit-logs, invitation create smoke

### Regression
- CRM + Sales + Projects + Finance e2e: **174 passed**
- Unit tests: **34 passed**
- `npm run typecheck:api`: 0 errors
- `npm run build --workspace apps/api`: success
- `npm run lint:api`: clean after e2e lint fixes (typed `rows`/`hits` casts)

---

## Limitations / Open Decisions

1. **`GET /team/forge-fund-entries`** — Doc 5 §15 finance alias; not implemented as a separate Team route (finance `/forge-fund-entries` remains the source of truth).
2. **`GET /domain-events`** — listed in Shared inventory; not implemented (no DomainEvent consumer UI in V1 backend phases).
3. **Document storage** — local/dev `StorageService` signing; production R2 wiring remains environment configuration.
4. **Portal** — out of scope; uncommitted portal frontend left untouched.

---

## Boundary Verifications

- **Prisma schema / migrations:** untouched
- **B5 Finance / B3 Sales / B4 Projects domain logic:** not rewritten (wiring-only for B6 registration)
- **Frontend `apps/web` portal work:** uncommitted and not staged
- **No commit performed** until verification reported complete (this document records verification)
