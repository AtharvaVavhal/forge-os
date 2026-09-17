# FORGE Business OS — Implementation Phase B4: Projects Backend

**Status:** Implementation complete and verified. All 34 new B4 Projects E2E tests passing against real PostgreSQL. Unit tests (34 passing), CRM E2E suites, and Sales Proposals E2E suites re-verified with 0 regressions.
**Scope:** Document 5 §7 (Projects, Project Templates, Milestones, Tasks, Time Entries), Document 5 §12.4 (Project Lifecycle & Gates), Document 5 §13 (Project Health Read Model), Document 5 §19 (Projects API Routes), Document 6 §2.3 (Projects & Tasks RBAC), Document 6 §17 (Tier A & C Audit Logging). Strict isolation from parallel B3 Sales and Frontend Portal work.

---

## Architecture & Design Overview

Phase B4 delivers the complete, self-contained Projects domain module for FORGE Business OS. It adheres strictly to the frozen specifications (Documents 1, 5, and 6) without inventing database models, unprompted endpoints, custom scoring algorithms, or unverified template schemas.

### Key Module Artifacts
- **Module Root:** `apps/api/src/modules/projects/`
  - `controllers/`: `ProjectsController`, `ProjectTemplatesController`, `MilestonesController`, `TasksController`, `TimeEntriesController`
  - `services/`: `ProjectsService`, `ProjectTemplatesService`, `MilestonesService`, `TasksService`, `TimeEntriesService`, `ScopeGuardsService`
  - `policies/`: `ProjectStateMachine` (status & phase transitions + gating), `MilestoneStateMachine` (forward/backward steps + revert reasons), `TaskStateMachine` (linear + reopen), `ResourceAuthorization` (`TEAM_MEMBER` project scoping, assignee self-edits, time entry author deletion)
  - `dto/`: DTOs strictly matching frozen Prisma models and API specs with `class-validator` / `class-transformer` decorators
- **Testing Root:** `apps/api/test/`
  - `projects.e2e-spec.ts`: 34 comprehensive E2E test scenarios across 11 test suites
  - `support/projects.ts`: Fixtures and authentication helpers for Projects testing

---

## Detailed Section Breakdown

### A. Project Creation & Defaults
- **Endpoint:** `POST /projects`
- **Permissions:** Requires `projects.manage` (`FOUNDER_ADMIN`, `OPERATIONS`).
- **Defaults:** Status initializes to `ACTIVE`, phase initializes to `PLANNING`.
- **Validation:** Company reference is validated within the caller's organization (`404` if missing or belonging to another organization). Optional `dealId` is validated in-org if provided. Optional `ownerId` must reference an active user in the organization.
- **Auditing:** Project creation does not require Tier A audit (matches Document 5 §19 / Document 6 §17).

### B. Project Updates
- **Endpoint:** `PATCH /projects/:id`
- **Permissions:** Requires `projects.manage` (`FOUNDER_ADMIN`, `OPERATIONS`).
- **Editable Fields:** `name`, `description`, `ownerId`, `deadline`, `tier`, `targetDate`.
- **Protection:** Status and phase cannot be mutated via `PATCH /projects/:id`. Any unknown fields or attempted mass-assignment fail validation (`400 Bad Request`). No delete/archive endpoint exists (`DELETE /projects/:id` returns `404`).

### C. Project Health Read Model
- **Endpoint:** `GET /projects/:id` (and populated in project listing)
- **Calculation Rules:** Follows Document 5 §7.3 and §13 exact specification without inventing ad-hoc scoring algorithms:
  - `overdueMilestones`: Count of milestones associated with the project where `due_date < now()` and `status != 'COMPLETED'`.
  - `deadlineProximityDays`: Difference in integer days between project `deadline` and current date (`now()`). Null if `deadline` is not set.
  - `atRisk`: Boolean flag evaluated as `true` if `status == 'AT_RISK'`, OR `deadlineProximityDays < 0` (overdue), OR `overdueMilestones > 0`.
- **Integrity:** The read model is derived dynamically on query and does not persist unverified schema fields.

### D. Project Status State Machine
- **Endpoint:** `POST /projects/:id/status`
- **Allowed States:** `ACTIVE`, `ON_HOLD`, `AT_RISK`, `COMPLETED`, `CANCELLED`.
- **State Policy:**
  - Non-terminal states (`ACTIVE`, `ON_HOLD`, `AT_RISK`) can transition freely among each other.
  - `CANCELLED` is terminal. Once reached, no further transitions are allowed (`409 PROJECT_STATUS_TERMINAL`).
  - `COMPLETED` is terminal and cannot be entered directly via `/status` (must be completed via `/complete` or phase transition fulfilling all completion preconditions). Once completed, no further transitions are allowed (`409 PROJECT_STATUS_TERMINAL`).
- **Audit Logging:** Emits Tier A audit event `project.status_changed` with metadata `{ from, to }`.

### E. Project Phase Progression
- **Endpoint:** `POST /projects/:id/phase`
- **Ordered Linear Phases:**
  1. `PLANNING`
  2. `DESIGN`
  3. `DEVELOPMENT`
  4. `QA`
  5. `CLIENT_REVIEW`
  6. `DEPLOYMENT`
  7. `HANDOVER`
  8. `COMPLETED`
- **Policy Rules:**
  - Forward single-step progression is standard.
  - Phase regression (moving backward) is forbidden (`409 PROJECT_INVALID_PHASE_REGRESSION`).
  - Transitioning into or past `COMPLETED` sets project `completed_at = now()`, project `status = COMPLETED`, and project `phase = COMPLETED`.

### F. Phase Gates
- **Gating Rules Enforced:**
  - **`CLIENT_REVIEW` → `DEPLOYMENT` Gate:** Blocked unless all milestones for the project marked with `requires_client_approval: true` have been approved (`approved_at != null` and `status == 'COMPLETED'`). If any approval is missing, rejects with `422 PHASE_GATE_FAILED`.
  - **`DEPLOYMENT` → `HANDOVER`:** Follows standard linear sequence. Attempting to jump over `HANDOVER` directly to `COMPLETED` without override is a phase skip and fails with `409 PHASE_SKIP_REQUIRES_OVERRIDE`.
  - **`HANDOVER` → `COMPLETED` Gate:** Blocked unless the project handover checklist is 100% complete (all checklist items have `done: true`). Rejects with `422 HANDOVER_CHECKLIST_INCOMPLETE`.

### G. Phase Skip Override
- **Endpoint:** `POST /projects/:id/phase`
- **Behavior:**
  - Attempting to skip phases forward (e.g. `PLANNING` → `DEVELOPMENT`) without override flag throws `409 PHASE_SKIP_REQUIRES_OVERRIDE`.
  - Supplying `{ to: targetPhase, override: true, overrideReason: string }` permits skipping forward.
  - An override requires an explanation reason.
  - Emits Tier A audit event `project.phase_overridden` recording `{ from, to, overrideReason }`.
  - Standard forward progression without override emits Tier A audit event `project.phase_changed`.

### H. Handover Checklist
- **Endpoint:** `PATCH /projects/:id/handover-checklist`
- **Data Shape:** JSON array of checklist items: `[{ key, label, done, doneAt, doneBy }]`.
- **Behavior:**
  - Merges updates into existing items.
  - Automatically timestamps `doneAt = now()` and records `doneBy = user.id` when an item is marked `done: true`.
  - Emits Tier A audit event `project.handover_item_completed` for each item marked completed.

### I. Project Completion
- **Endpoint:** `POST /projects/:id/complete`
- **Behavior:**
  - Verifies that all handover checklist items are complete. If incomplete, rejects with `422 HANDOVER_CHECKLIST_INCOMPLETE`.
  - Atomically sets `status = 'COMPLETED'`, `phase = 'COMPLETED'`, and `completed_at = now()`.
  - Emits Tier A audit event `project.completed`.

### J. In-Memory / Config Project Templates
- **Endpoint:** `GET /project-templates`
- **Design:** Configuration-based in-memory templates only. No custom database models or mutable template endpoints were invented.
- **Configured Templates:**
  - In accordance with the frozen architecture and strict non-invention mandate, no arbitrary template IDs or names are invented.
  - `GET /project-templates` returns the in-memory configured templates array (currently `[]` since no specific template definitions are frozen in the schema or API specifications).
- **Output:** Returns array of configured template objects `[{ id, name }]`.

### K. Milestones
- **Endpoints:**
  - `POST /projects/:id/milestones` (Create milestone)
  - `GET /projects/:id/milestones` (List project milestones)
  - `POST /milestones/:id/transition` (Transition milestone status)
- **Allowed States:** `PENDING`, `IN_PROGRESS`, `AWAITING_APPROVAL`, `COMPLETED`, `CANCELLED`.
- **Lifecycle & Revert Policy:**
  - Step progression: `PENDING` → `IN_PROGRESS` → `AWAITING_APPROVAL` → `COMPLETED`.
  - Reverting from `COMPLETED` to an earlier state requires an explicit `reason` string (`400 MILESTONE_REVERT_REASON_REQUIRED`).
  - Transitioning out of `COMPLETED` clears `approved_at` and records a Tier A audit event `milestone.reverted`.
  - Standard forward transitions record Tier A audit event `milestone.transitioned`.
  - Marking milestone `COMPLETED` when `requires_client_approval: true` automatically records `approved_at = now()`.

### L. Tasks
- **Endpoints:**
  - `POST /projects/:id/tasks` (Create task)
  - `GET /projects/:id/tasks` (List project tasks with filters)
  - `PATCH /tasks/:id` (Update task details / blocker)
  - `POST /tasks/:id/assign` (Assign task to user)
  - `POST /tasks/:id/transition` (Transition task status)
- **Allowed States:** `TODO` → `IN_PROGRESS` → `IN_REVIEW` → `DONE`.
- **Reopen Policy:** `DONE` → `TODO` is permitted, setting `reopened_at = now()` and emitting audit event `task.reopened`.
- **Blocker Logic:**
  - `blocked_by_task_id` can be set to link to a dependency task within the same project.
  - A task cannot block itself (`400 TASK_CANNOT_BLOCK_SELF`).
- **Assignment:**
  - Assignee must belong to the same organization (`404` if user is in another organization).
  - Emits Tier A audit event `task.assigned`.

### M. Time Entries
- **Endpoints:**
  - `POST /tasks/:id/time-entries` (Log time)
  - `GET /tasks/:id/time-entries` (List time entries)
  - `DELETE /time-entries/:id` (Remove time entry)
- **Validation:** `minutes` must be a positive integer > 0 (`400 Bad Request` on <= 0).
- **Permissions & Scoping:**
  - Users can log time against tasks they have access to.
  - `TEAM_MEMBER` users can only list their own logged time entries.
  - Time entry deletion is restricted to the author who logged the entry or users with `projects.manage`.

### N. Resource Authorization
- **`TEAM_MEMBER` Scoping:**
  - Team members can only view projects where they are the designated project `owner_id` or assigned to at least one task in the project.
  - When listing tasks or time entries, `TEAM_MEMBER` queries are scoped to their assigned tasks / authored entries.
  - Assignee self-action: A user assigned to a task can update its status and edit task fields, but cannot modify unassigned tasks without `projects.manage`.

### O. RBAC Matrix
| Role | Projects Read (`projects.read`) | Projects Manage (`projects.manage`) | Tasks Manage (`tasks.manage`) | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **FOUNDER_ADMIN** | Yes (wildcard) | Yes (wildcard) | Yes (wildcard) | Full access |
| **OPERATIONS** | Yes | Yes | Yes | Full project & task lifecycle management |
| **SALES** | Yes | No (`403`) | No (`403`) | Read-only visibility |
| **FINANCE** | Yes | No (`403`) | No (`403`) | Read-only visibility |
| **TEAM_MEMBER** | Scoped | No (`403`) | Self-assignee only | Scoped to assigned projects and tasks |

### P. Organization Isolation & IDOR Protection
- Every database query binds `organization_id` strictly from the validated session token.
- Foreign references (`companyId`, `dealId`, `userId`, `milestoneId`, `blockedByTaskId`) verify multi-tenant boundaries.
- Cross-tenant requests return `404 Not Found` rather than leaking record existence.

### Q. Transactions & Concurrency
- Phase changes, milestone completions, task assignments, and checklist completion transitions are guarded by database transactions and atomic conditional updates.
- Tested under real concurrent requests (`Promise.all`) ensuring state consistency without double-completion.

### R. Audit Logging
Implemented exclusively using the existing append-only `AuditService`:
- `project.status_changed`
- `project.phase_changed`
- `project.phase_overridden`
- `project.handover_item_completed`
- `project.completed`
- `milestone.transitioned`
- `milestone.reverted`
- `task.assigned`
- `task.reopened`

### S. Deal-Won Integration Boundary
- In accordance with the prompt's instructions, Deal-Won automated downstream project creation was **NOT** implemented in this phase.
- The `ProjectsService.create()` service method and integration interface are cleanly exported and ready to be invoked by future Deal-Won orchestration.

---

## Verification & Test Results

### 1. New B4 Projects E2E Test Suite (`apps/api/test/projects.e2e-spec.ts`)
- **Total Tests:** 36
- **Passed:** 36
- **Failed:** 0
- **Suites:**
  1. Authentication & RBAC (5 tests)
  2. Project Lifecycle & CRUD (5 tests)
  3. Project Status State Machine (1 test)
  4. Project Phase State Machine & Gating (7 tests)
  5. Handover Checklist & Project Completion (3 tests)
  6. Project Templates (1 test)
  7. Milestones (2 tests)
  8. Tasks (4 tests)
  9. Time Entries (3 tests)
  10. Organization Isolation & IDOR Protection (4 tests)
  11. Concurrency / State Safety (1 test)

### 2. Full API Typecheck & Linting
- `npm run typecheck`: 0 errors.
- `npx eslint --quiet "src/modules/projects/**/*.ts" "test/projects.e2e-spec.ts" "test/support/projects.ts"`: 0 errors, 0 warnings.
- `npm run build`: Success.

### 3. Regression Suite
- Unit tests (`npm test`): 5 suites, 34 tests passing.
- CRM E2E suites (`crm-companies.e2e-spec.ts`): 9 tests passing.
- Sales Proposals E2E suites (`sales-proposals.e2e-spec.ts`): 18 tests passing.

---

## Boundary & Parallel Work Verifications
- **Prisma Schema:** Unchanged (`git diff --stat prisma/` is empty).
- **Database Migrations:** Unchanged (0 new migrations).
- **Frontend (`apps/web`):** Untouched (portal uncommitted files preserved without staging).
- **Sales Module (`apps/api/src/modules/sales`):** Untouched (0 modifications).
- **Marketing Repository (`/Users/atharva/Forge`):** Untouched.
