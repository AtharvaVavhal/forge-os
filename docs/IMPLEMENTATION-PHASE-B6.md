# FORGE Business OS — Implementation Phase B6: Team + Shared Systems

**Status:** Authorization hardening applied after B5+B6 combined acceptance audit (search + documents TEAM_MEMBER row-level scope). Prior B6 wiring verified against real PostgreSQL.
**Scope:** Document 5 §10 / §15 / §19 (Team directory & workload; Notes; Documents + presign/download/soft-delete; Notifications; Global Search; AuditLog query). Document 6 §2.3 / §17 (documents/notes RBAC, Tier A document delete, Tier B note visibility). Frozen Prisma schema — **no migrations**.

---

## Architecture & Design Overview

Phase B6 registers the Team module and expands the global Shared module with Notes, Documents, Notifications, Search, and Audit Logs query surfaces. Domain services already existed as untracked work; this phase completed Nest wiring (AppModule / SharedModule / AUDIT_ACTIONS / TEAM_MEMBER `team.workload.read`) without rewriting those services.

### Authorization hardening (post-audit)
- **Search:** reuses B2 `teamMemberScopedCompanyContactWhere` (companies/contacts fail-closed), skips deals for TEAM_MEMBER (B2 deny), and applies B4 `teamMemberProjectWhere` to projects **and** tasks so search ⊆ resource API visibility.
- **Documents:** TEAM_MEMBER must name exactly one parent on presign; parent checks reuse B2 CRM asserts + B4 `assertTeamMemberMayAccessProject`. List/download/delete are scoped to assigned-project parents only (CRM/finance parents remain fail-closed for this role).

### Key Module Artifacts
- **Team:** `apps/api/src/modules/team/`
  - `TeamController` / `TeamService` — members directory + workload
- **Shared (B6 surfaces):** under `apps/api/src/modules/shared/`
  - `notes/` — create/list/patch; exactly-one parent; visibility Tier B audit
  - `documents/` — presign, register, download URL, soft-delete (+ local `StorageService`)
  - `notifications/` — own inbox + mark-read
  - `search/` — cross-entity `q=` search gated by module read permissions **and** row-level resource scope
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
| GET | `/documents` | Authenticated | Soft-deleted excluded; TEAM_MEMBER assigned-project only |
| POST | `/documents/presign-upload` | Authenticated | MIME/size validation; TEAM_MEMBER requires authorized parent |
| POST | `/documents` | Authenticated | Register after upload; one parent; TEAM_MEMBER assigned only |
| GET | `/documents/:id/download-url` | Authenticated | Signed/local URL; parent-authorized |
| POST | `/documents/:id/delete` | Authenticated | Soft-delete; Tier A audit; parent-authorized |
| GET | `/notifications` | Authenticated | Own recipient only |
| POST | `/notifications/:id/read` | Authenticated | Own only; cross-user → 404 |
| GET | `/search` | Authenticated | `q` required; permission + row-level resource scope |
| GET | `/audit-logs` | `audit.read` | FOUNDER_ADMIN + FINANCE |

**Activities** remain under CRM (`/activities`) — not reimplemented in B6.

---

## RBAC Highlights

| Capability | FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER |
| --- | --- | --- | --- | --- | --- |
| Team members list | ✓ | ✓ | ✓ | ✓ | ✓ |
| Team workload | ✓ | ✓ | — | — | own only |
| Notes / Documents | ✓ | ✓ | ✓ | ✓ | assigned project parents (B2 CRM / finance parents denied) |
| Notifications | own | own | own | own | own |
| Audit logs | ✓ | ✗ | ✓ | ✗ | ✗ |
| Search | ✓ (all readable types) | ✓ | ✓ | ✓ | projects/tasks assigned only; CRM fail-closed |

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

See the `fix(api): close B6 search and document authorization gaps` commit / local verification run for exact suite counts after the authorization fix.

---

## Limitations / Open Decisions

1. **`GET /team/forge-fund-entries`** — Doc 5 §15 finance alias; not implemented as a separate Team route (finance `/forge-fund-entries` remains the source of truth).
2. **`GET /domain-events`** — listed in Shared inventory; not implemented (no DomainEvent consumer UI in V1 backend phases).
3. **Document storage** — local/dev `StorageService` signing; production R2 wiring remains environment configuration.
4. **Portal** — out of scope; uncommitted portal frontend left untouched.
5. **Companies/contacts “linked to assigned projects”** — still B2 fail-closed empty scope (no computed company↔assigned-project link helper); Search/Documents follow that same fail-closed model rather than inventing a new assignment graph.

---

## Boundary Verifications

- **Prisma schema / migrations:** untouched
- **B5 Finance / B3 Sales / B4 Projects domain logic:** not rewritten (Search/Documents only *consume* existing B2/B4 authorization helpers)
- **Frontend `apps/web` portal work:** uncommitted and not staged
