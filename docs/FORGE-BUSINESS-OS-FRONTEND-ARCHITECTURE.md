# FORGE Business OS — Frontend Architecture Specification

**Type:** Implementation-ready frontend architecture specification. No frontend code was written, no packages installed, no `package.json` changed, no API client connected, and the existing marketing site at `/Users/atharva/Forge` was not touched.
**Scope:** `app.forgebuilds.in` (the Business OS) as the primary subject of this document, per Document B3's explicit routing/section requests. The Client Portal (`portal.forgebuilds.in`) is addressed only where its existence constrains an architectural decision (principally §1 and §4) — its own full frontend spec is out of scope here.

**Source-of-truth hierarchy used throughout:**
1. **Frozen Forge Business OS architecture/database documents** — `docs/FORGE Business OS — Database Specification (Frozen Architecture v1).md` and `docs/FORGE Business OS — Red Team Review.md`, both read in full before writing anything below. Every entity, enum, field, module boundary, and API convention cited here traces to one of these two files, cited inline as **(DB Spec)** or **(Red Team §N)**.
2. `docs/FORGE-BUSINESS-OS-UI-UX-DIRECTION.md` — referenced as "**Doc 1**."
3. `docs/FORGE-BUSINESS-OS-DESIGN-SYSTEM.md` — referenced as "**Doc 2**."

No entity, field, workflow, or permission model below was invented. Where the frozen documents leave something open, it is marked **NOT CURRENTLY DEFINED** and carried forward — not resolved on this document's own authority. Several items Doc 2 left open are genuinely resolved by the newly-available frozen documents; where that happened, it's called out explicitly in §27 rather than silently treated as always having been known.

---

## 1. Frontend Application Architecture

### Two applications, not one
The frozen architecture requires `User` and `ClientUser` to be architecturally separate — separate cookie names/paths (`forge_session` vs `portal_session`), separate JWT audiences (`aud: internal` vs `aud: portal`), and a portal JWT that **cannot** be validated by internal-API guards **(Red Team §5.4)**. This is a strong enough backend-level separation that this document recommends the frontend mirror it as **two separate Next.js applications** — `app.forgebuilds.in` (internal OS) and `portal.forgebuilds.in` (Client Portal) — rather than one Next.js app with two route groups sharing a session model. A shared codebase for two applications with intentionally incompatible sessions is exactly the kind of boundary a future refactor could accidentally blur (an internal fetch helper reused against a portal session, an internal-only route accidentally reachable from the portal bundle). This is a **recommendation requiring Forge confirmation**, not something the frozen documents state outright — flagged accordingly in §27.

What the two applications **share**: a design-token package and a UI-primitives package (Doc 2 §2–§11 tokens/components, published as an internal package rather than duplicated file-for-file) — never business logic, auth handling, or API client instances.

The rest of this document specifies **`app.forgebuilds.in`** unless stated otherwise.

### App Router structure
```
app/
  (auth)/                        — public route group, no sidebar/topbar
    layout.tsx                   — minimal shell: logo + centered content
    login/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx

  (workspace)/                   — protected route group
    layout.tsx                   — app shell (Doc 2 §9): Sidebar + TopBar +
                                    CommandPalette provider + auth guard
    dashboard/page.tsx
    crm/...                      — see §2
    projects/...                 — see §2
    finance/...                  — see §2
    team/...                     — see §2
    settings/...                 — see §2
    notifications/page.tsx       — full notification history (§17)

  layout.tsx                     — root: fonts, global providers, global styles
  loading.tsx                    — root-level fallback (rare; route-level
                                    loading.tsx is preferred, §19)
  error.tsx                      — root-level error boundary (§19)
  global-error.tsx               — catches errors in the root layout itself
  not-found.tsx                  — 404 (§19)
```

- **Route groups:** `(auth)` and `(workspace)` are Next.js route groups — they don't affect the URL, only which `layout.tsx` wraps the segment. This is how the authenticated app shell (sidebar/topbar) is kept out of the login screen without duplicating layout logic.
- **Layouts:** one layout per route group as above, plus a `layout.tsx` inside each domain segment (`crm/`, `finance/`, etc.) **only** where a sub-nav or shared header is genuinely needed (e.g. a Finance-wide summary strip) — not by default, to avoid layout-nesting for its own sake.
- **Loading states:** a `loading.tsx` alongside every route that fetches data on the server, rendering the Skeleton variant matching that route's eventual layout (Doc 2 §11 Skeleton, §19) — not a generic spinner.
- **Error boundaries:** a route-level `error.tsx` for every top-level domain segment (`crm/error.tsx`, `finance/error.tsx`, etc.), rendering the Alert-based error state (Doc 2 §19) with a "Try again" action (`reset()`), so one domain's data failure doesn't take down the whole shell.
- **Not-found handling:** a segment-level `not-found.tsx` for each `[id]` detail route (`crm/deals/[id]/not-found.tsx`, etc.) triggered by calling Next's `notFound()` when the API returns a 404 for that record — rendered as the Empty State pattern (Doc 2 §19), not a generic "404" page, so it reads as "this record doesn't exist or you don't have access to it," which is also the correct **non-enumerating** response shape for an authorization failure disguised as a 404 (§5).
- **Authentication boundaries:** enforced at the `(workspace)/layout.tsx` server component — it checks session validity server-side before rendering the shell or any child route, redirecting to `(auth)/login` on failure. This is a UX convenience, not the security boundary (§5) — every API call the shell subsequently makes is independently authorized by the backend regardless of what the layout decided.
- **Protected vs public routes:** everything under `(workspace)` is protected. Everything under `(auth)` is public. There are no other public routes in `app.forgebuilds.in` — this is an internal tool, not a marketing surface (that's the existing, separate `forgebuilds.in` site).
- **Server/client component boundaries:** default to Server Components for anything that only reads and renders data (list pages, detail-page read sections, the dashboard). Client Components (`"use client"`) are used only where interactivity genuinely requires it: forms, the Command Palette, Kanban drag state, filter/sort controls, the Sidebar's collapse toggle, Toast provider, anything holding local UI state (Doc 2's motion/hover states). This keeps the bundle lean and matches §22's performance principles.
- **Providers:** a single `Providers.tsx` client component wraps the app in the root layout, composing (in order): the proposed server-state client provider (§6), the Toast provider, the Command Palette provider, and a theme-token provider only if runtime theming is ever needed (it currently isn't — Doc 2's tokens are static, no light/dark toggle exists or is planned, per the marketing site's own "fixed art direction, not a theme toggle" rule inherited into the OS).
- **Global styles / design tokens:** one `globals.css` implementing Doc 2 §24's token inventory (116 tokens) as CSS custom properties, imported once in the root layout — structurally the same pattern the existing marketing site already uses in `src/app/globals.css`, not a new approach.
- **Feature organization:** see §8 — domain folders mirror the backend's module boundaries (`crm`, `sales`, `projects`, `finance`, `team`, `shared`) rather than a flat `components/` dumping ground.

No feature outside the frozen entity list (below) is scaffolded, routed, or referenced.

---

## 2. Routing Structure

Route tree for `app.forgebuilds.in`, built only from entities that exist in the frozen Database Specification. Each leaf notes its backing entity; anything without a real backing entity is marked and excluded from the tree rather than silently included.

```
/dashboard

/crm
  /leads                         Lead
  /leads/[id]
  /companies                     Company
  /companies/[id]
  /contacts                      Contact
  /contacts/[id]
  /deals                         Deal
  /deals/[id]

/projects
  /projects                      Project
  /projects/[id]
  /milestones                    Milestone   — cross-project list, filterable by project
  /tasks                         Task        — cross-project list, default filter assignee=me
                                                (Red Team §8: highest-frequency query in the system)
  /proposals                     Proposal    — owned by the backend's `sales` module (§8 of this
  /proposals/[id]                             doc), surfaced here because the frozen nav groups it
                                                under Projects; see §8 note on this distinction

/finance
  /invoices                      Invoice
  /invoices/[id]
  /payments                      Payment     — list view; canonical detail is usually reached via
  /payments/[id]                              an Invoice's Payments tab, but this route exists as
                                                the deep-linkable, shareable canonical page (§12)
  /expenses                      Expense     — list only; edited via Drawer, no full detail route
                                                needed for a 7-field entity (§12)
  /forge-fund                    ForgeFundEntry — ledger view, not a record-detail page (§15)

/team
  /members                       User
  /members/[id]
  /roles                         User.role (UserRole enum) — role *assignment*, not a role-
                                                *builder*; see the flag below
  /workload                      Computed view over Task + TimeEntry + User — no dedicated entity
  # /payouts — INTENTIONALLY OMITTED. No Payout/TeamPayout entity exists anywhere in the frozen
  #   Database Specification. Building this route would require inventing an entity, which this
  #   document is explicitly instructed not to do. See §15 and §27.

/settings
  /roles-permissions             User.role (UserRole enum) — same underlying data as /team/roles;
                                                see flag below on why this is thin
  /integrations                  NOT CURRENTLY DEFINED — no Integration entity in the frozen
                                                schema. Route exists as a placeholder destination
                                                only (§27).
  /templates                     NOT CURRENTLY DEFINED — "project templates" are described in the
                                                DealWon automation narrative (Red Team §3) but no
                                                ProjectTemplate/MilestoneTemplate table exists in
                                                the frozen schema. Route exists as a placeholder
                                                destination only (§27).
  /audit-log                     AuditLog

/notifications                   Notification — full history; the top-bar bell opens a
                                                truncated live panel (Doc 2 §9), this route is
                                                the "view all" destination
```

### Explicitly not routed
- **`/settings/roles-permissions` and `/team/roles` scope note:** the frozen schema has **no `Role`/`Permission` table** — role is a fixed `UserRole` enum (`FOUNDER_ADMIN | OPERATIONS | FINANCE | SALES | TEAM_MEMBER`) directly on `User` **(DB Spec, "two underspecified gaps resolved... Role → enum, not table")**. These two routes are therefore **assignment** UIs (pick one of five fixed values per team member) and, at most, a **read-only, frontend-hardcoded** reference table of what each role can typically do — never a permission-matrix editor, custom-role creator, or anything implying the backend has a flexible permission model. This is stated explicitly so no future implementer builds a role-builder against a schema that doesn't support one.
- **Search** has no dedicated results-page route — it is served entirely by the Command Palette (§18), matching Doc 2's original decision. This remains unresolved as a standalone concern (§27) rather than decided here, since nothing in the frozen backend docs settles it either.
- **Documents, Activities, Notes** have no top-level routes — they are per-record tabs (`?tab=documents` etc.) inside each detail page (§12), backed by the real polymorphic `Document`/`Activity`/`Note` tables **(DB Spec)**, consistent with Doc 2 §10's resolution.
- **Maintenance Contracts and Support Tickets** are real entities in the frozen schema (`MaintenanceContract`, `SupportTicket`) but **were not requested in this task's routing list** and are therefore not scaffolded into the route tree above. They exist and would follow the exact same detail-page pattern (§12) as everything else when their turn comes in the implementation order (§26) — flagged here only so their absence from the tree above isn't misread as "these entities don't exist."

---

## 3. App Shell

Architecture only — the full visual specification (dimensions, color, type, motion) is Doc 2 §9 and is not repeated here. This section defines how each shell piece is **built**, not how it **looks**.

- **Sidebar:** a Client Component (`Sidebar.tsx`) holding only UI state (expanded/collapsed, active-hover) — the nav tree itself (§2) is a static, typed constant (`navTree.ts`), not fetched from an API. Active-route highlighting uses Next's `usePathname()`. Role-based item visibility (§5) is computed from the session's role claim, already available to the layout server component and passed down as a prop — never re-fetched client-side.
- **Topbar:** a Server Component shell (breadcrumb resolved server-side from the current route segment) wrapping Client Component islands for the search trigger, notification bell (needs live unread count), and account menu (needs the session).
- **Breadcrumbs:** derived from the route segments themselves plus one data-dependent lookup for the current record's display name on detail pages (e.g. `/crm/deals/[id]` resolves `Deal.title` for the trailing breadcrumb segment) — fetched once, server-side, alongside the page's own data fetch, not as a separate round trip.
- **Global search:** the topbar's search field is a **trigger only** — clicking or `⌘K`-ing it opens the Command Palette (§18); it holds no results UI of its own.
- **Command palette:** a single, app-root-mounted Client Component (`CommandPalette.tsx`) registered once in the `(workspace)` layout, opened via a global keyboard listener and the topbar trigger. Its result set is two static sources merged: a hardcoded command registry (navigation shortcuts, "New Deal," "New Task," etc.) and a live entity-search query (§18) debounced against the backend's full-text index.
- **Notification center:** the topbar bell renders a Client Component popover backed by a short-poll or (if the backend later exposes one) a push subscription for unread count; the popover itself fetches the most recent N notifications on open, not continuously.
- **Account menu:** reads session data already available to the layout (name, email, role) — no separate fetch.
- **Main content area:** each route's own `page.tsx`, rendered inside the `(workspace)` layout's content slot.

### Responsive behavior
Exactly as specified in Doc 2 §22, restated here only as an architectural note: the sidebar's collapse state at the 1024–1279px breakpoint and its overlay-drawer state below 1024px are both **CSS/viewport-driven** (media queries + a small amount of client state for the drawer's open/closed toggle), not server-detected — there is no user-agent sniffing or server-side device branching anywhere in this shell.

---

## 4. Authentication Boundaries

Grounded directly in the frozen security model **(Red Team §5.4, §6)** — this section describes frontend *handling*, not the auth mechanism itself (that's a backend concern).

| State | Frontend behavior |
|---|---|
| **Unauthenticated user** | `(workspace)/layout.tsx` (server component) checks for a valid `forge_session` cookie/JWT before rendering; failure redirects to `(auth)/login`. No shell, no data fetch, no flash of protected content. |
| **Authenticated internal user** | Session (role, name, email — whatever claims the backend's `aud: internal` JWT carries) is read once in the layout and passed down; the shell renders normally. |
| **Session expiry** | Every API client call (§6) checks for a `401`; on receipt, the client-side data layer clears cached server state and redirects to `/login?expired=1`, which shows a brief "Your session expired" message rather than a bare login form — this is a UX nicety, the actual expiry enforcement already happened server-side. |
| **Logout** | A single action that calls a backend logout endpoint (invalidates the session server-side) and then clears all client-cached server state (§6) before redirecting to `/login` — logging out without clearing the client cache would let stale data flash on a subsequent login by a different user on the same device. |
| **Permission denial** | See §5 — never a silent failure; either the control was already hidden/disabled (expected), or an unexpected `403` from the backend is shown as a calm, specific Alert ("You don't have permission to do this"), never a generic error. |
| **Forbidden routes** | A route the user's role shouldn't reach (§5) either isn't in their rendered nav at all, or — if navigated to directly by URL — renders the same "you don't have access" Empty-State-derived page used for a 404 on a record (§1, §19), deliberately **not** distinguishing "doesn't exist" from "exists but you can't see it" in the UI copy, mirroring the backend's own non-enumerating posture on the portal side **(Red Team §5.10, applied here by analogy)**. |
| **Loading authentication state** | The `(workspace)/layout.tsx` session check happens server-side before any HTML streams, so there is no client-visible "checking auth..." loading state for the common case. The one client-visible loading state is the brief window during an in-app session-expiry redirect (above), which uses the standard route-transition Skeleton, not a bespoke spinner. |

**Hard boundary, restated for the frontend team specifically:** `User` (internal) and `ClientUser` (portal) are never represented by the same TypeScript type, the same session-reading hook, or the same API client instance — even though `app.forgebuilds.in` will never itself hold a `ClientUser` session, this rule exists so that if the "two separate applications" recommendation in §1 is ever *not* followed, the code still cannot accidentally cross the boundary the backend has already drawn.

---

## 5. Authorization UI

**The frontend is a convenience layer, not a security boundary** — restated as the governing rule for everything below, matching the task's own framing and the backend's posture in Red Team §5–§6 (every object-level check happens server-side, query-scoped, never trusted from the client).

| Pattern | Behavior |
|---|---|
| **Hidden action** | An action the user's role can never perform (e.g. a `TEAM_MEMBER` seeing "Approve Refund") is not rendered at all — not disabled, not present-but-grayed. Reduces clutter for the common case where a role simply never does that thing. |
| **Disabled action** | An action the user's role *can* generally perform, but not on *this specific record right now* (e.g. "Send Invoice" on an invoice that's already `SENT`) — rendered, disabled, with a tooltip explaining why (state-based, not role-based, disabling). |
| **Forbidden page** | See §4's table — the non-enumerating Empty-State-derived page. |
| **Permission-aware navigation** | The sidebar's nav tree (§3) is filtered by role at render time from the same static `navTree.ts` constant, using a per-item `visibleTo: UserRole[]` field maintained in the frontend — **this list is a UX convenience the frontend owns, not a security list**; it must be kept in sync with whatever the backend actually enforces, but a frontend bug in this file can only ever over- or under-*display* a nav item, never grant an unauthorized action, because every route it links to still hits real backend authorization on data fetch. |
| **Permission-aware buttons** | Same pattern as nav — role-gated at render time from the session claim already available in the shell, no separate "can I do X" API call for simple role checks. |
| **Unauthorized API response** | Any `403` the frontend receives despite its own hiding/disabling logic (stale role cache, a nav-list bug, a direct API call attempt) is treated as authoritative and correct — the UI updates to reflect it (hide the now-known-forbidden action, show a calm Alert) rather than retrying or arguing with it. |

### What this document explicitly does not do
It does not attempt to encode a full role→permission matrix in the frontend, because the frozen backend defines **only the five `UserRole` enum values** and no accompanying permission table **(DB Spec)** — there is no authoritative source for "exactly what FINANCE can and cannot do" beyond what the backend's guards will enforce at implementation time. The `navTree.ts` `visibleTo` lists and button-level role checks above are therefore a **best-effort UX approximation**, explicitly flagged as needing to be reconciled against the backend's actual guard implementation once it exists (§27) — not duplicated backend logic that could silently drift, but a genuinely separate, lower-stakes layer that fails safe (worst case: a hidden button the user's role could actually have used, not an exposed one they shouldn't have).

---

## 6. Data Fetching Architecture

- **Server-side fetching (default):** Server Components fetch directly via a typed server-only API client (§7) using Next.js's native `fetch` with its built-in request-memoization and revalidation controls — this is the default for every list and detail page's initial data.
- **Client-side fetching (interactive surfaces only):** used for anything that needs to refetch/mutate without a full navigation — Kanban drag-and-drop, inline table edits, the Command Palette's live search, form submission, the notification popover.
- **Caching / revalidation:** two layers —
  1. Next.js's own server-side fetch cache/`revalidatePath`/`revalidateTag` for server-rendered pages.
  2. **PROPOSED — REQUIRES IMPLEMENTATION APPROVAL: TanStack Query (React Query)** for client-side server-state (the interactive surfaces above) — cache keys namespaced by entity + query params (e.g. `['deals', { stage, ownerId, cursor }]`), `staleTime` tuned per entity volatility (near-zero for Invoice/Payment status, longer for Company/Contact records that change rarely), invalidated on mutation success rather than polled. **This library is not installed and must not be installed without explicit approval** — if it is not approved, the fallback is native `fetch` + component-local state for the handful of surfaces that need client-side refetching, accepting more manual cache-invalidation code as the tradeoff.
- **Mutations:** a typed mutation function per entity action (`createDeal`, `updateInvoiceStatus`, etc.) living in that entity's `api/` module (§8), never an inline `fetch` call inside a component.
- **Optimistic updates:** used **only** for low-stakes, easily-reversible UI state — a Kanban card moving columns, a Task status checkbox, marking a notification read. **Never** used for financial mutations (Invoice status changes, Payment recording, ForgeFundEntry creation) — those wait for the server response before updating the UI, because the frozen architecture treats these as the exact class of operation where a silent client-side assumption diverging from the DB-enforced truth (optimistic locking via `version`, DB `CHECK` constraints, transactional webhook handling — all **(DB Spec)**) would be actively misleading rather than merely inconvenient to undo.
- **Invalidation:** mutation success invalidates the specific query keys it affects plus, where the backend's own event table implies a cascade (e.g. `DealWon` creating a `Project` — **Red Team §3, §12**), the related entity's list/detail queries too (invalidating both `['deals', dealId]` and `['projects']` on a Deal→Won mutation, since a new Project now exists).
- **Error handling:** every mutation and query surfaces the backend's error envelope (§7) through a consistent hook-level error shape; components branch on `error.code`, never on `error.message` string content (the backend explicitly designed the envelope this way — **Red Team §13** — and the frontend must honor that contract, not work around it).
- **Loading states:** Skeleton-first for initial page loads (server-rendered, so this is largely Next's `loading.tsx` mechanism, §1), inline `Spinner` for mutation-in-flight button states (Doc 2 §11).

---

## 7. API Contract Layer

The frozen documents include real API architecture guidance **(Red Team §13)** but not a dedicated endpoint-by-endpoint contract document ("Document 5" in the task's numbering does not exist in this repository). Everything below marked with **(Red Team §13)** is taken directly from that section; everything else is explicitly flagged as dependent on a future API specification.

### What is known (Red Team §13)
- **Base path:** `/api/v1/...` — URL-prefixed versioning from day one.
- **Conventions:** plural nouns, standard HTTP verbs, `PATCH` for partial updates (never `PUT` on domain entities with computed/derived fields).
- **Error envelope:** `{ error: { code, message, details } }` — the frontend's typed API client parses this shape on every non-2xx response; `code` is the stable, machine-readable field components branch on. A generated or hand-maintained TypeScript union of known `code` values is the target shape once the backend's actual code list exists — **NOT CURRENTLY DEFINED** (the enumeration of codes themselves), so the client's error-handling type is `{ code: string; message: string; details?: unknown }` (an open string, not a closed union) until that list is provided.
- **Pagination:** cursor-based for high-growth tables, offset-based for small/stable ones. The frozen documents actually name the split explicitly — **cursor:** `Activity`, `Task`, `Document`, `Contact` **(Red Team §8, §15)**; **offset:** `Company`, `Deal`, `Project` **(Red Team §8)** and, by the same "small table" reasoning, `Invoice`/`Payment`/`Expense`/`ForgeFundEntry`/`Milestone`/`Proposal`/`Lead` at this team's stated scale, though those specific tables aren't individually named — treated here as offset-paginated by inference from the stated principle, not an explicit per-table backend confirmation. *(This resolves what Doc 2 had flagged as an open "cursor vs. offset" question — see §27.)*
- **Filtering:** query params matching indexed columns only (`?stage=won&owner=uuid`) — no arbitrary filter DSL is exposed, so the frontend's Filter Bar (§11, Doc 2 §11) may only offer filters on columns the backend actually indexes (§E of the DB Spec: `Deal.stage`, `Project.status`, `Invoice.status`, `Task(assignee_id, status)`, plus the FK columns each table's list view scopes by).
- **Sorting:** implied by the same indexed-column constraint — no general-purpose sort-by-any-column UI; sort options per table are a fixed, small set matching what's indexed (mirroring Red Team §8's per-table "Sort" column: e.g. Deals sort by Value/Created/Next follow-up, Invoices by Due date/Amount).
- **Search:** backend-side full-text via Postgres GIN index, scoped to exactly `Company.name`, `Contact.name`/`email`, `Deal.title`, `Project.name`, `Invoice.invoice_number`, `Task.title` **(DB Spec §E)** — the Command Palette's entity-search (§18) must not imply it searches anything beyond this set (no searching Note/Activity bodies, no searching Payment/Expense/ForgeFundEntry).
- **Mutation validation:** the backend validates via `class-validator` DTOs and rejects unknown fields (`forbidNonWhitelisted`) — the frontend's own form schemas (§10) should mirror each DTO's shape field-for-field once those DTOs exist, to fail fast client-side with the same rules the server will enforce, rather than relying on trial-and-error against 400 responses.
- **Idempotency:** `Idempotency-Key` header required on POST endpoints that create financial records — explicitly named: **Invoice creation, Payment recording (manual/offline entry)**. The frontend's mutation layer (§6) generates a fresh UUID per submit attempt and includes this header on those two mutation types; whether `Refund`, `CreditNote`, or manual `ForgeFundEntry` creation also require it is **NOT CURRENTLY DEFINED** beyond those two named cases — the frontend applies the header defensively to all financial-record-creating POSTs as a safe default, without treating that extension as backend-confirmed.
- **Rate limiting:** per-user token bucket, stricter on `auth` — the frontend should handle a `429` response (once the exact envelope for it is known) as a distinct, calm "slow down" state, not a generic error; the exact response shape for a rate-limit rejection is not specified and is carried forward as open (§27).

### What is NOT CURRENTLY DEFINED (depends on a future API specification)
- Exact endpoint paths per entity beyond the plural-noun convention (e.g. whether Deal-stage-change is `PATCH /deals/:id` with a `stage` field, or a dedicated `POST /deals/:id/stage`).
- Exact request/response DTO shapes per entity.
- The full enumeration of `error.code` values.
- Exact query-param names for filters/sort beyond the examples given.
- Webhook-adjacent frontend concerns (none expected — webhooks are entirely backend-to-backend, the frontend never calls Razorpay directly for anything beyond redirecting into its checkout flow, per the portal's "Pay Now" action **(Red Team §6)**).

Until that specification exists, the frontend's typed request/response boundary is built as a thin, entity-scoped wrapper per domain module (§8) around a shared low-level client (auth headers, base URL, error-envelope parsing, idempotency-key injection) — every call site is typed against a locally-defined TypeScript interface for that entity's expected shape (derived from the DB Spec's field tables), explicitly documented as **provisional** until real DTOs are confirmed.

---

## 8. Domain Feature Structure

Frontend code is organized to mirror the backend's own module boundaries **(Red Team §13)** — `auth`, `crm`, `sales`, `projects`, `finance`, `team`, `portal`, `shared` — because that boundary already encodes real business-logic dependency rules (e.g. "`finance` must not import `sales` directly — gets proposal data only via the snapshot already copied onto Invoice"), and re-deriving a different frontend grouping would just create a second, inconsistent map of the same domain.

```
features/
  crm/            Company, Contact, Lead, Deal
  sales/          Proposal, ProposalLineItem
  projects/       Project, Milestone, Task, TimeEntry
  finance/        Invoice, Payment, Refund, CreditNote, Expense, ForgeFundEntry,
                  MaintenanceContract
  team/           User (as "Team Member"), role assignment, workload
  shared/         Activity, Note, Document, Notification, AuditLog — cross-cutting,
                  attaches to records owned by every other domain module
```

Each `features/<domain>/` folder holds, uniformly:
```
features/crm/
  api/            typed request/response functions + query-key constants (§7)
  components/     domain components (Doc 2 §23's "domain" tier) — DealPipelineColumn,
                  CompanyMasthead, LeadStatusBadge, etc.
  hooks/          domain-specific data hooks (useDeal, useDealsList) wrapping §6's
                  data-fetching layer
  types.ts        entity types for this domain, matching the DB Spec field tables
  utils.ts        pure domain logic with no UI (e.g. "can this Deal move to Won" —
                  a UI-side mirror of a backend rule, used only to drive disabled-
                  state UX, never trusted as the actual enforcement, §5)
```

`components/` at the repo root is reserved for **primitives and composites only** (Doc 2 §11/§23 — Button, Input, Table, Modal, Tabs, etc.) and **never contains business logic or entity-specific naming**. A `DealPipelineColumn` component does not live in `components/`; it lives in `features/crm/components/`. This is the explicit rule the task asked for: no giant generic `components/` folder accumulating domain logic by default.

### The Proposal / "Projects" nav tension, resolved
Doc 2's frozen navigation groups **Proposals** under the **Projects** sidebar section (§2 of this document, §10 of Doc 2). The backend's module boundary owns `Proposal` inside `sales`, separate from `projects` **(Red Team §13)**. These are not in conflict — they answer different questions. The **nav tree** (§2, §3) is a user-facing information-architecture decision, already frozen by Doc 2, and stays as given. The **code architecture** (this section) follows the backend's actual dependency boundary, because that's what prevents accidental coupling (e.g. a `projects` feature module reaching into `sales` internals rather than reading the already-copied `Project.accepted_proposal_id` snapshot **(DB Spec)**). A `/projects/proposals` route's `page.tsx` is therefore a **page component** (§8/§23 tier) that imports from `features/sales/`, not a `features/projects/` file that happens to be about proposals — the URL and the code module are allowed to disagree, and page components are exactly the layer designed to reconcile that.

### Page components
Route-level composition only — `app/(workspace)/crm/deals/[id]/page.tsx` fetches (server-side, §6) and composes `features/crm/components/*`, introducing no new styling or business-logic decisions of its own, per Doc 2 §23's page-component tier definition (unchanged here, restated because routing is this document's subject).

---

## 9. State Management

| Category | Belongs in | Examples |
|---|---|---|
| **Server state** | The data-fetching layer (§6) — Next.js server-fetch cache and/or the proposed TanStack Query cache. Never mirrored into a separate global store. | Deal records, Task lists, Invoice detail, notification counts |
| **URL state** | Route params and `searchParams` — the actual source of truth for anything that should be shareable/bookmarkable/back-button-able. | Active table filters, sort column, pagination cursor, selected detail-page tab (`?tab=activity`), Command Palette open/closed is *not* URL state (too transient) but a deep link into a specific record *is* |
| **Local UI state** | Component-local `useState`/`useReducer`. Never promoted to a global store merely for convenience. | Sidebar collapsed/expanded, a Dropdown's open state, a form field's focus state, Kanban drag-in-progress position |
| **Form state** | The forms architecture (§10) — scoped to the form component tree, never global. | Draft edits to a Deal before submit, the multi-step "New Proposal" form |
| **Session state** | Read once from the server in the `(workspace)` layout (§4), passed down via props/React Context for the shell's own needs (role-gating, account menu) — not refetched or duplicated into another state container. | Current user's name/role/email for nav-gating and the account menu |

**Explicit rule:** no global client-side store (Redux/Zustand/Jotai/etc.) is introduced. Every category above already has a natural, narrower home. If a future screen seems to need cross-cutting global state, that's a signal to re-examine whether it's actually server state (put it in the query cache) or URL state (put it in `searchParams`) before reaching for a new dependency — consistent with the task's explicit instruction not to introduce global state for convenience.

---

## 10. Forms

Forms use the Doc 2 §14 visual/interaction spec (unified focus treatment, `rounded-lg` fields, validation timing, sticky actions) — this section defines the code architecture underneath it.

- **Form schemas:** **PROPOSED — REQUIRES IMPLEMENTATION APPROVAL: Zod** schemas per entity, one per mutation type (`createDealSchema`, `updateDealSchema`), living alongside that entity's `api/` module (§8) — chosen because its shape-validation philosophy mirrors the backend's own `class-validator` DTO approach **(Red Team §13)**, making it straightforward to keep the two in sync once real DTOs exist, not because it's assumed pre-approved. **Not installed without explicit approval**; the fallback is hand-written validation functions with the same per-entity organization.
- **Validation:** client-side schema validation runs on-blur first, then on-change once a field has shown an error (Doc 2 §14) — this is a UX timing rule, independent of which validation library implements it.
- **Server errors:** a failed mutation's error envelope (§7) is mapped back onto the relevant form field when `error.details` identifies a field-level problem (shape: field name → message, exact shape **NOT CURRENTLY DEFINED** until the API spec exists — the mapping function is written defensively, falling back to a form-level Alert when it can't confidently attribute an error to a specific field).
- **Dirty state / unsaved changes:** tracked by comparing current form values against the initially-loaded record; drives the "Unsaved changes" indicator and the confirm-before-discard prompt (Doc 2 §14).
- **Optimistic/concurrent edits:** for the two entities the backend optimistically locks (`Invoice`, `Payment` — both carry a `version` column **(DB Spec)**), the form submits that `version` back with its update request; a `409`-shaped conflict response (exact shape **NOT CURRENTLY DEFINED**, carried forward) is handled by refetching the current record and showing a "this was changed by someone else — review and retry" state rather than silently overwriting. No other entity needs this pattern, matching the backend's own deliberately narrow scoping of optimistic locking **(DB Spec §F: "adding it everywhere would be unnecessary ceremony")**.
- **Submit states:** idle → submitting (button shows `Spinner`, disabled, per Doc 2 §11 Button) → success (either an inline readback per Doc 2 §19, or a redirect to the new/updated record's detail page) → error (field-level and/or form-level Alert).
- **Autosave:** **not built anywhere in V1.** Nothing in the frozen documents specifies autosave for any entity, and several of the most-edited entities (Invoice line items, Proposal terms) are explicitly **immutable-after-send/finalize** at the backend level **(DB Spec, Red Team §2)** — autosaving a draft that the backend will then freeze on submit is a meaningfully different feature (draft-persistence) that isn't specified and isn't assumed here.
- **Confirmation before destructive actions:** every action that is irreversible or has real consequence (Void an invoice, Cancel a project, Archive a company, any `DELETE`-shaped action) routes through the Confirmation Dialog (Doc 2 §11) — never a bare button that fires the mutation on click.
- **Multi-column layouts / sections / sticky actions:** as specified in Doc 2 §14, unchanged — this document doesn't re-derive the visual spec, only confirms the form architecture above is built to support it (e.g. sticky-footer actions require the form's layout container to be a fixed-height scroll region, not the whole page scrolling).

---

## 11. Tables / Lists

Grounded directly in Red Team §8's per-table matrix — the frontend does not invent filter/sort/view options beyond what that table specifies, and flags the tables it doesn't cover.

| Table | Default columns | Filters | Sort | Saved views | Bulk actions | Export |
|---|---|---|---|---|---|---|
| Deals | Name, Company, Stage, Value, Owner, Next follow-up | Stage, Owner, Source, Date range | Value, Created, Next follow-up | Yes (per-user) | Bulk owner reassign | CSV |
| Companies | Name, Contacts, Active projects, Last activity | Tag, Has active project | Name, Last activity | Yes | Bulk tag | CSV |
| Projects | Name, Client, Phase, Health status, Deadline | Phase, Status, Owner | Deadline, Created | Yes | None (Red Team: "not needed at 5-person scale") | Not needed V1 |
| Tasks | Title, Project, Assignee, Due, Priority | **Assignee=me (default!)**, Status, Project | Due date | Yes ("My tasks" default) | Bulk status/assignee change | Not needed |
| Invoices | Number, Client, Amount, Status, Due date | Status, Overdue, Date range | Due date, Amount | Yes | Bulk send reminder | CSV (accountant will ask) |

*(all values above are Red Team §8, verbatim — not re-derived)*

- **Payments, Expenses, Forge Fund, Contacts, Leads, Milestones, Proposals** are not covered by Red Team §8's table and their specific default-columns/filters/sort/saved-views/bulk/export behavior is **NOT CURRENTLY DEFINED** beyond Doc 2's general dense-table rules (§12 of Doc 2) — carried forward as an open item (§27) rather than invented per-table here.
- **Search:** inline per-table search (distinct from the global Command Palette, Doc 2 §11) is only meaningful on the columns the backend's index actually covers (§7) — for tables outside that indexed set, inline search is client-side filtering of the already-loaded page only, not a backend query, and should be labeled/scoped accordingly in the UI so it doesn't imply it searches the full dataset.
- **Sorting:** implemented as a URL-state-driven (`?sort=value&dir=desc`) server-side query param, matching the fixed per-table sort-option set above (§9).
- **Pagination:** cursor-based UI (Doc 2 §11 Pagination, §12) used against the backend's cursor-paginated tables (`Contact`, `Activity`, `Task`, `Document` — §7); offset-style page state (still rendered with the same `Previous`/`Next` UI, since Doc 2's compact/degrade-gracefully design already covers this) for everything else.
- **Saved views:** confirmed **SHOULD HAVE** at the product level for Deals/Companies/Projects/Tasks/Invoices (table above, Red Team §20). **No `SavedView` (or equivalent) entity exists anywhere in the frozen Database Specification.** This is a genuine gap between a confirmed UX requirement and the schema — flagged, not silently resolved. Until a backend entity exists, "saved views" for V1 can only be implemented as **per-browser `localStorage` persistence** (not synced across devices/users, not a real backend feature) — an explicit, documented downgrade from the intended per-user server-synced feature, carried forward in §27 as needing a backend decision.
- **Bulk actions:** implemented as described in §12 of Doc 2 (contextual action bar replacing the Filter Bar on selection) — scoped to exactly the actions named in the table above, nothing broader (Red Team §8 explicitly warns against building bulk actions beyond these: "bulk-editing company records is a rare, high-risk action — keep it single-record").
- **Row actions:** per Doc 2 §12 — trailing overflow menu or 1–2 inline icons, entity-appropriate (e.g. a Deal row's inline action might be "Log activity," an Invoice row's might be "Send reminder").
- **URL synchronization:** every table's filter/sort/pagination state lives in `searchParams` (§9), so a filtered, sorted, paginated table view is always a shareable link and survives a page refresh — no table's interactive state lives only in component memory.

---

## 12. Detail Pages

Reusable architecture, applied to the eleven entities this task specifies: **Company, Contact, Lead, Deal, Proposal, Project, Invoice, Payment, Expense, Forge Fund, Team Member.** Structure follows Doc 2 §15 (masthead → key facts → tabs), populated here with the **actual frozen fields** for each entity — resolving what Doc 2 had explicitly left open ("exact field lists... belong to the frozen architecture document, which does not exist in this repo") now that it does.

A single generic `RecordDetailLayout` component (§8/§23, `features/shared/`) implements the masthead/tabs/sidebar shell once; each entity supplies its own masthead fields, tabs, and related-record queries as configuration, not a re-implementation of the layout.

| Entity | Masthead | Key facts (`dl`) | Tabs |
|---|---|---|---|
| **Company** | `name` (title), archived status | GSTIN, Billing State, Tags | Overview · Contacts (related) · Deals (related) · Projects (related) · Documents · Notes · Activity |
| **Contact** | `name` (title) | Company (linked), Email, Phone | Overview · Deals (related) · Activity · Notes |
| **Lead** | Contact/Company-derived title, `LeadStatus` badge | Source (`LeadSource`), Contact, Company, Converted Deal (link, if `converted_to_deal_id` set) | Overview (notes) · Activity |
| **Deal** | `title`, `DealStage` badge | Company, Contact, `estimated_value` (financial number), Owner, Next follow-up, Lost Reason (if `stage=LOST`) | Overview · Proposals (related) · Activity · Notes · Documents |
| **Proposal** | "Proposal v{`version`}", `ProposalStatus` badge | Deal (link), Sent/Viewed/Accepted/Expires dates | Overview (terms + `ProposalLineItem`s) · Activity |
| **Project** | `name`, `ProjectStatus` + `ProjectPhase` badges | Company, Deal (link, if any), Owner, Deadline | Overview · Milestones · Tasks · Handover Checklist (`handover_checklist` JSON, rendered as a checklist widget) · Documents · Activity |
| **Invoice** | `invoice_number`, `InvoiceStatus` badge | Company, `amount`, `paid_amount`, Outstanding (computed `amount − paid_amount`, client-side display only, never re-derived as the source of truth — §14), Due Date | Line Items (`InvoiceLineItem`s) · Payments (related) · Credit Notes (related) · Documents · Activity |
| **Payment** | `amount`, `PaymentStatus` badge, `method` | Invoice (link), Paid At, Reference/Razorpay IDs, Recorded By | Refunds (related) · Activity |
| **Expense** | *(no full detail page — see below)* | | |
| **Forge Fund** | *(no record-detail page — see §15)* | | |
| **Team Member** (`User`) | `name`, `UserRole` badge, Active/Inactive | Email, Last Login | Assigned Tasks (`Task.assignee_id`) · Owned Deals (`Deal.owner_id`) · Owned Projects (`Project.owner_id`) · Workload (§13/§2 computed view) |

**Expense** is deliberately excluded from the full masthead/tabs architecture — it's a seven-field entity (`description`, `amount`, `category`, `incurred_at`, `project_id`, `recorded_by`) with no related-record depth to justify tabs. It's edited via a Drawer from the `/finance/expenses` list, not a dedicated `[id]` route, per §2's note.

**No field above was invented.** Every masthead/key-fact/tab mapping traces to an actual column or a real relationship in the DB Spec's entity tables. Where a "related records" tab is listed (e.g. Company → Deals), it's backed by the real FK (`Deal.company_id`), queried and paginated per §11's rules at a smaller scale within a `Panel` (Doc 2 §11).

**Responsive behavior:** exactly Doc 2 §15/§22 — masthead stacks below ~768px, tabs become horizontally scrollable, two-column Overview collapses to one column.

---

## 13. Dashboard

No fake or hard-coded data anywhere — every widget below is backed by a real query against real entities, and every widget has an explicit loading/empty/error state (Doc 2 §16/§19). Aggregation queries live in one service-layer boundary conceptually (mirroring **Red Team §15**'s explicit guidance to isolate dashboard aggregation "in one service method, not scattered inline queries," restated here as a frontend contract: the dashboard fetches from a small, stable set of aggregate endpoints, not N ad hoc per-widget queries scattered across components).

| Widget | Backing data | Loading | Empty | Error |
|---|---|---|---|---|
| KPI tiles | Aggregate counts/sums (open Deals + value, overdue Invoices + amount, active Projects) — `Deal.stage`, `Invoice.status`, `Project.status` | Skeleton KPI shape (Doc 2 §11) | A KPI whose underlying set is genuinely empty (e.g. zero active projects) renders `0`/`₹0`, not an Empty State — a KPI is never "missing," only possibly zero | Alert, KPI row collapses to a single inline error message rather than 4 broken tiles |
| Pipeline | `Deal` grouped by `stage`, count + `estimated_value` sum | Skeleton bar shape | Empty State ("No open deals yet") if the pipeline is genuinely empty | Alert |
| Active projects | `Project WHERE status = ACTIVE`, table | Skeleton rows | Empty State | Alert (table structure preserved, §12 of Doc 2) |
| Outstanding invoices | `Invoice WHERE status IN (SENT, PARTIALLY_PAID, OVERDUE)` ordered by `due_date` | Skeleton rows | Empty State ("Nothing outstanding") | Alert |
| Tasks | "My open tasks": `Task WHERE assignee_id = me AND status != DONE` — **the single most-run query in the system (Red Team §8, §E)** | Skeleton flat-section rows | Empty State ("Nothing on your plate") | Alert |
| Activity | Recent `Activity`/`Note`/`Document` rows across entities, most recent first | Skeleton Timeline | Empty State | Alert |
| Notifications | Recent `Notification WHERE recipient_id = me` | Skeleton Timeline-style list | Empty State | Alert |
| Charts | Revenue trend: `SUM(Payment.amount) WHERE status = COMPLETED`, grouped by `paid_at` month — **"by payment date not invoice date," per Red Team §4's explicit source-of-truth rule** | Skeleton chart shape | Empty State if no completed payments exist yet | Alert |

Widget **type** (Card / Flat Section / Table / Timeline / Chart Container) follows Doc 2 §16's explicit mapping — not repeated here, only grounded in real queries above.

---

## 14. Finance UI Architecture

- **Money / Decimal handling:** every monetary field in the frozen schema is `Decimal @db.Decimal(12,2)` **(DB Spec)** — never Float. The frontend must never perform monetary arithmetic using native JS `number` where the result is presented as truth (a total, a balance, an outstanding amount). Two rules follow:
  1. **Transport:** monetary values arrive from the API as strings (the standard safe serialization for Prisma `Decimal` over JSON) — the frontend's entity types (§7) type these fields as `string`, not `number`, at the API boundary.
  2. **Display-only computation** (e.g. showing `amount − paid_amount` as "Outstanding" on an Invoice detail page, §12): performed with a decimal-safe arithmetic approach — **PROPOSED — REQUIRES IMPLEMENTATION APPROVAL: `decimal.js` or `big.js`** for any such client-side arithmetic — never `parseFloat(a) - parseFloat(b)`. Any value that must be authoritative (the actual `paid_amount`, the actual invoice total) always comes from the backend directly, never from client-side summation of line items as the source of truth — the backend's own `line_total` per `InvoiceLineItem` is already "computed at creation, stored (not recomputed on read)" **(DB Spec)**, and the frontend should mirror that posture: display what the server says, recompute client-side only for an *in-progress, unsaved* draft (e.g. a new invoice being composed before submit).
- **INR formatting:** `₹` prefix, Indian digit grouping (lakhs/crores), `tabular-nums`, right-aligned, IBM Plex Mono — Doc 2 §17, unchanged, restated here only to confirm the formatting utility is a single shared `formatCurrency()` function in `features/finance/utils.ts` (or `features/shared/` if other domains need it), never reimplemented per component.
- **GST:** `TaxTreatment` (`CGST_SGST | IGST | EXEMPT`) is computed and frozen on the `Invoice` at creation time from the org's and company's billing states **(DB Spec)** — the frontend never computes or edits this value; it only displays whatever the backend has already decided, and renders the corresponding tax line items (`cgst_rate`/`sgst_rate`/`igst_rate` per `InvoiceLineItem`, already copied/frozen values, not live-looked-up) exactly as stored.
- **Invoice status:** rendered via the Status Badge component (Doc 2 §11) mapped directly from `InvoiceStatus` (`DRAFT | SENT | PARTIALLY_PAID | PAID | OVERDUE | VOID | CANCELLED`) — semantic color mapping: `PAID` → Success, `OVERDUE` → Danger, `SENT`/`PARTIALLY_PAID` → Neutral or Info (exact split between these two is a UX call not specified by the frozen docs — recommend `SENT` = Neutral, `PARTIALLY_PAID` = Info, both defensible, neither backend-mandated), `DRAFT` → Pending (dashed, per Doc 2 §3), `VOID`/`CANCELLED` → Neutral with a strikethrough or reduced-emphasis treatment (not Danger — these aren't failures, they're intentional non-events).
- **Payments:** `PaymentStatus` (`PENDING | COMPLETED | FAILED | REVERSED`) badge-mapped similarly (`COMPLETED` → Success, `FAILED` → Danger, `REVERSED` → Neutral, `PENDING` → Pending/dashed). Payment rows always show `method` (`RAZORPAY | CASH | BANK_TRANSFER | CHEQUE`) as a small mono label alongside status, since offline vs. gateway payments carry different trust/verification weight per the backend's own reasoning **(Red Team §4: "offline payments are a bigger fraud/error surface, treat them with more logging, not less")** — the UI should visually distinguish offline-recorded payments (e.g. a small "Recorded manually by {user}" caption) from gateway-confirmed ones, surfacing that distinction rather than flattening it.
- **Refunds:** shown on the Payment's Refunds tab (§12), `RefundStatus` (`PENDING | COMPLETED | FAILED`) badge-mapped the same way; refund creation is a form (§10) requiring `reason` and routed through Confirmation Dialog (irreversible financial action).
- **Credit notes:** shown on the Invoice's Credit Notes tab (§12), distinct from Refunds per the backend's explicit separation **(DB Spec, Red Team §1/§4)** — a Credit Note may have `amount = 0` (pure documentation correction with no money movement), and the UI must not assume every Credit Note implies a refund happened; it displays `CreditNoteReason` (`SCOPE_REDUCTION | PRICING_ERROR | CANCELLATION | GOODWILL | OTHER`) plainly.
- **Outstanding / Paid / Overdue:** these are **statuses and computed display values**, not separate entities — "Outstanding" = `amount − paid_amount` (display-only, per the decimal rule above); "Paid"/"Overdue" are `InvoiceStatus` values, not independently derived by the frontend.
- **Forge Fund:** see §15, its own section given the task's explicit emphasis.

---

## 15. Forge Fund UI

**Uses only the frozen `ForgeFundEntry` model.** No `TeamPayout` entity is created, referenced, typed, or routed anywhere in this frontend architecture — there is no such entity in the Database Specification, and the task explicitly forbids inventing one.

### The real model
```
ForgeFundEntry
  type            ForgeFundEntryType   CONTRIBUTION | WITHDRAWAL | ALLOCATION
  amount          Decimal(12,2)        positive for CONTRIBUTION,
                                        negative for WITHDRAWAL/ALLOCATION
  source_type     String?              e.g. "payment" — set only for automatic entries
  source_id       Uuid?                e.g. payment_id — set only for automatic entries
  reason          Text                 required, always
  approved_by     Uuid → User          required, always
```
**(DB Spec — ForgeFundEntry)**

### UI architecture
- **This is a ledger, not a record-detail entity.** `/finance/forge-fund` renders: a running-balance KPI (`SUM(ForgeFundEntry.amount)`, "full ledger scan, cheap at this volume, don't cache" — **Red Team §4**, so the frontend does not attempt to cache or locally derive this balance across sessions either), followed by a dense Table (§11) of every entry, newest first.
- **Manual entries** — the three operational workflows the task asks for (Contribution, Withdrawal, Allocation) are each a small form (§10), opened from a `primary`/`secondary` button above the ledger table, that creates exactly one `ForgeFundEntry` row:
  - **Contribution:** form collects `amount` (positive) + `reason`. `source_type`/`source_id` left null (manual entries are structurally distinguished from automatic ones by having no source, per **DB Spec**: "Manual entries always have `source_ref = null`... structurally distinguishable from automatic ones in reporting" — Red Team §4).
  - **Withdrawal:** form collects `amount` (entered as a positive number by the user for clarity, sent to the API as negative per the schema's sign convention, or sent positive with the backend applying the sign — **exact request-shape convention (does the client send a signed or unsigned amount for Withdrawal/Allocation) is NOT CURRENTLY DEFINED** and is carried forward in §27; the UI's job is simply to never let the *displayed* amount be ambiguous about direction, regardless of what's transmitted) + `reason`.
  - **Allocation:** same shape as Withdrawal — `amount` + `reason`. **No 60/40 or any other fixed split is hardcoded anywhere in this UI.** If "allocation" implies splitting a contribution across multiple purposes/people, that structure (who gets what share) is not represented in the frozen `ForgeFundEntry` model at all — it's a single row with a `reason` text field. The UI therefore treats each Allocation as **one manual entry with a free-text reason**, not a multi-recipient split form — building a percentage-split UI would be inventing behavior the schema doesn't support.
  - Every manual-entry form requires `approved_by` — in practice, pre-filled from the submitting user's session (assuming they are the approver) but the field is real, required, and its value flows through to the actual API payload, not decorative.
  - All three forms route through the Confirmation Dialog before submit (irreversible financial action, §10) and use the Idempotency-Key convention applied defensively to financial-record-creating POSTs (§7).
- **Authorization:** who is allowed to create manual entries at all is a role question the frozen docs don't fully spell out beyond the general `FINANCE`/`FOUNDER_ADMIN` roles existing — the UI hides these action buttons per §5's role-gating pattern, using the same "best-effort, backend-authoritative" posture as everywhere else.
- **No `PayoutStatus` workflow** (pending/approved/paid, or anything resembling one) is built, because no such workflow or entity exists in the frozen architecture. If team payouts are meant to be represented as `ForgeFundEntry` **WITHDRAWAL** rows with a descriptive `reason` (e.g. "Q1 payout — [team member]"), that's a plausible mapping but is **not stated by the frozen documents** — flagged as an open modeling question for Forge to confirm (§27), not assumed here.

---

## 16. Documents / Files

Grounded in the real `Document` entity and the backend's stated security posture **(DB Spec — Document; Red Team §5.9, §10)**.

- **Upload:** direct-to-storage via a presigned upload URL obtained from the backend — the frontend never proxies file bytes through its own server, and never holds storage credentials (bucket keys, R2 tokens) in the client bundle at any point (§23). The upload component requests a presigned URL, uploads directly to it, then confirms the upload to the backend (which writes the `Document` row: `filename`, `storage_key`, `mime_type`, `size_bytes`, `category`, `visibility`, the polymorphic parent FK, `uploaded_by`).
- **Upload progress:** the File Upload component (Doc 2 §11) shows a determinate Progress bar (Doc 2 §11 Progress) driven by the presigned-upload request's own progress events — not a fake/simulated progress indicator.
- **File metadata:** displayed exactly as stored — filename, size (human-formatted), category (`DocumentCategory` enum — `PROPOSAL | CONTRACT | INVOICE | RECEIPT | HANDOVER | REQUIREMENT | CLIENT_ASSET | INTERNAL`), visibility (`INTERNAL | CLIENT_VISIBLE`), uploader, upload date.
- **Signed URLs (download):** every download link is requested fresh from the backend at click-time (short-lived signed URL, matching the backend's stated "regenerate on each page load, never long-lived/public" posture — **Red Team §5.3, §10**) — the frontend never stores or caches a signed URL beyond the single click that requested it, and never constructs a storage URL itself.
- **Expired URLs:** if a signed URL is somehow used after expiry (a stale browser tab, a bookmarked direct link), the resulting storage-layer error is caught and shown as a specific, calm message ("This link has expired — refresh the page to get a new one"), not a generic broken-image/broken-download failure.
- **Deletion:** soft-delete only (`deleted_at` on `Document`, **DB Spec**) — the UI's delete action shows a Confirmation Dialog and, on success, removes the row from the visible list; it never implies the underlying file is immediately, irrecoverably gone (backend retains it in storage for a 90-day window per the DB Spec's note).
- **Permission errors:** a document fetch/download that fails authorization is shown as the same calm, non-enumerating Alert/Empty-State pattern used elsewhere (§4, §19) — never a raw storage-provider error message.
- **Visibility-based rendering:** `Document.visibility = CLIENT_VISIBLE` items are the only ones ever shown in the Client Portal (a portal-side concern, out of this document's primary scope, noted here only because the internal OS's own upload form must correctly expose the `visibility` choice to the uploader, since that flag is what the backend's portal query filters on **(Red Team §6: "Structurally impossible if... filtering happens in the query itself")** — the internal-OS frontend's only responsibility here is to make that choice explicit and correct at upload time, not to duplicate the filtering logic itself).

**No storage credentials, bucket names, or signed-URL-generation logic ever live in frontend code** — every one of the operations above is a backend API call, restated explicitly because it's also a §23 security requirement.

---

## 17. Notifications

Grounded in the real `Notification` entity **(DB Spec)**: `recipient_type` (`USER | CLIENT_USER`), `recipient_id`, `type`, `channel` (`IN_APP | EMAIL`), `payload` (Json), `read_at`.

- **Notification center:** the topbar popover (Doc 2 §9) plus the full-history `/notifications` route (§2) — both read from the same underlying list, the popover simply truncated/most-recent.
- **Unread state:** `read_at IS NULL` — the topbar bell's badge count and each row's visual unread indicator (Doc 2 §9's small dot) are both driven directly by this field, never a separately-tracked client-side "seen" flag.
- **Grouping:** by day (mono date labels), per Doc 2 §9 — a display concern only, the underlying data isn't grouped server-side.
- **Mark read:** a mutation setting `read_at` — fires on click-through (opening the notification's target) and via an explicit "mark all read" action; optimistic (§6 — this is exactly the kind of low-stakes, reversible-in-effect UI state optimistic updates are for).
- **Navigation target:** resolved from `type` + `payload`. **The exact shape of `payload` per notification `type` is not specified in the frozen documents** (`Json` is opaque at the schema level) — this is a genuine open dependency (§27): the frontend needs a documented contract (likely part of the still-nonexistent API specification) mapping each `type` string to what `payload` contains and therefore which route to navigate to. Until that exists, the notification-click handler is written against a small, explicit switch over the known event types named in **Red Team §11** (`Task assigned/due`, `Deal follow-up due`, `Invoice overdue`, `Proposal viewed`, `Payment received`, `Maintenance expiring`) with a documented `// TODO: confirm payload shape with backend` per case, rather than a generic/unsafe payload-shape assumption.
- **Email/in-app distinction:** `channel` — the in-app notification center only ever shows `IN_APP` (and dual-channel) entries; there is no in-app "view sent emails" log, matching the backend's design (email delivery is Resend's concern, tracked via delivery webhooks on the backend side per **Red Team §11**, not surfaced as a frontend feature).
- **Batching/digest types** (per **Red Team §11**'s table — e.g. daily task-due digests) are backend-side delivery decisions; the frontend simply renders whatever `Notification` rows exist, regardless of whether they were sent instantly or as part of a digest — no frontend batching logic is needed or built.

---

## 18. Search / Command Palette

- **Global search:** scoped exactly to the backend's indexed fields (§7): `Company.name`, `Contact.name`/`email`, `Deal.title`, `Project.name`, `Invoice.invoice_number`, `Task.title` **(DB Spec §E)**. The Command Palette's entity-search results are grouped by entity type (mono group labels, Doc 2 §9), each row linking to that record's detail page (§12).
- **Command palette (as a feature):** confirmed **SHOULD HAVE** at the product level — **"High leverage for daily 8h use, cheap to build once nav exists"** **(Red Team §20)** — and its highest-value moments are explicitly named: jumping to "New Proposal" from a Deal, jumping to "Generate Invoice" from a Project, and global entity search **(Red Team §7)**. The palette's command registry (§3) should prioritize exactly these two action shortcuts alongside navigation, since the backend's own UX analysis names them as the highest-frequency actions in an 8-hour day.
- **Keyboard navigation:** ↑/↓ to move through results, `Enter` to select, `Esc` to close — standard palette behavior (Doc 2 §9/§11), full focus trap while open (§20).
- **⌘K / Ctrl+K keybinding:** **PROPOSED — REQUIRES FORGE APPROVAL.** The command palette *feature* is validated by the red team as a SHOULD HAVE; the specific `⌘K` keybinding convention is not stated anywhere in the frozen documents and must not be treated as approved just because the feature it triggers is. This is the same distinction Doc 2 already drew and it is not resolved by the newly-available backend documents — carried forward unchanged (§27).
- **Recent searches:** not specified anywhere in the frozen documents as a required or permitted feature — **NOT CURRENTLY DEFINED**, not built, carried forward as an open product question rather than assumed either way.
- **Entity navigation:** selecting a search result or a "New X" command navigates via standard Next.js client-side routing to that entity's route (§2) — no special navigation mechanism beyond what §2's route tree already defines.

---

## 19. Error / Loading Architecture

Application-wide patterns, built on Next.js's file-convention mechanisms (§1) and rendered with Doc 2's §19 visual language — this section is the wiring, not the visual spec.

| State | Mechanism | Rendering |
|---|---|---|
| **Loading** | Route-level `loading.tsx` (server-rendered routes) or a query's `isLoading` state (client-fetched surfaces, §6) | Doc 2 §11 Skeleton, shape-matched to the eventual content — never a disconnected full-page spinner where the layout is already known |
| **Empty** | A successful fetch returning zero rows/no record | Doc 2 §19 Empty State — honest, restrained, at most one action |
| **Error** | A route-level `error.tsx` (server-render failures) or a query's `isError` state; parses the `{ error: { code, message, details } }` envelope (§7) | Doc 2 §19 Alert (danger), with a "Try again" action wired to `reset()` (server) or `refetch()` (client) |
| **Forbidden** | A `403` response | The non-enumerating forbidden page (§4/§5) — deliberately not distinguished from Not Found in its copy |
| **Not found** | A `404` response → `notFound()` called explicitly, triggering the nearest `not-found.tsx` | Empty-State-derived "this record doesn't exist" page (§1) |
| **Offline / network failure** | A fetch that fails to complete at all (no response, not an HTTP error status) | A distinct state from a `5xx`/`4xx` — "You appear to be offline" messaging, with a retry action; the data-fetching layer (§6) must distinguish "request failed to send" from "request completed with an error status," since these have different correct messages |
| **Session expiry** | A `401` on any authenticated request | Per §4 — clear client cache, redirect to `/login?expired=1` |

**No screen ships without all four of Loading/Empty/Error states defined** where that screen's data can plausibly be in any of them — this is restated as a hard requirement here because it's also item 1 on Doc 2's QA checklist (§25 of Doc 2), and this document is where it becomes an actual per-route implementation obligation rather than a review-time check.

---

## 20. Accessibility Architecture

Implementation requirements — the standards themselves are Doc 2 §21; this section states how they're enforced in this specific application's architecture.

- **Semantic HTML:** real `<table>` for every data table (§11), real `<nav>`/`<main>`/`<aside>` landmarks in the shell layouts (§1/§3), real `<button>`/`<a>` elements (never a `<div onClick>`) throughout the primitive component layer (Doc 2 §11) — enforced by those primitives being the *only* way interactive elements are built (§8's "primitives" tier), not by per-usage discipline.
- **Keyboard navigation:** every interactive primitive (Doc 2 §11) ships its keyboard behavior as part of the primitive itself (e.g. `Table` implements arrow-key row navigation once, centrally — §11 of Doc 2 — rather than every table instance reimplementing it). Domain components (§8) inherit this for free by composing primitives rather than building bespoke interactive elements.
- **Focus management:** the single unified `:focus-visible` treatment (Doc 2 §7/§21) is a global CSS rule, not a per-component concern; dialogs (Modal/Drawer/Command Palette) each implement the focus-trap-on-open / focus-return-on-close pattern once, at the primitive level (§8's overlays tier, Doc 2 §11), inherited by every usage (Confirmation Dialog, a record-edit Drawer, etc.) automatically.
- **ARIA:** used only where semantic HTML can't express the pattern — the Combobox (`role="combobox"`/listbox), the Command Palette (dialog + listbox), Toast (`aria-live="polite"`) — each implemented once at the primitive level (Doc 2 §11/§21), not reauthored per feature.
- **Tables:** every `Table` instance requires a caller-supplied accessible name (a visually-hidden heading or `<caption>`, Doc 2 §21) — enforced as a required prop on the shared `Table` primitive, so a domain feature (§8) cannot render a table without naming its purpose.
- **Dialogs:** `role="dialog"` + `aria-modal="true"`, labelled, focus-trapped — implemented once (above), used everywhere a Modal/Drawer/Confirmation Dialog/Command Palette appears.
- **Forms:** every field's label is programmatically associated (Doc 2 §14/§21) via the shared `Field` composite (§8's forms/ composite), not per-form markup — a form built from `Field` cannot accidentally omit this.
- **Reduced motion:** the global `prefers-reduced-motion: reduce` CSS rule (Doc 2 §8/§21) is inherited from the shared token/global-styles package (§1) — every animated primitive (skeleton shimmer, drawer slide, drag lift) respects it by construction, because it's implemented at the CSS-variable level those primitives already consume, not re-checked per component.
- **Screen-reader behavior for dynamic content:** the notification Toast container is the one `aria-live="polite"` region in the shell (§3, Doc 2 §21) — no other part of the app announces changes live, avoiding over-announcement.

---

## 21. Responsive Architecture

Exactly Doc 2 §22's table, restated here as the architectural mechanism rather than the visual behavior (the values themselves are not repeated):

| Range | Sidebar | Tables | Kanban | Dashboard | Detail pages | Forms | Navigation |
|---|---|---|---|---|---|---|---|
| **≥1280px** | Expanded (CSS default state, §3) | Full columns | 4+ columns | Full grid | 2-column | Multi-column | Full nav visible |
| **1024–1279px** | Auto-collapse to icon rail (CSS media query + a persisted user override, §3) | Horizontal scroll or column drop | ~3 columns | 2-column KPI row | 2-column, narrower | Multi-column | Full nav |
| **768–1023px** | Overlay drawer (client state, hidden by default) | Horizontal scroll | 1.5–2 columns, scroll-snap | Single column | Single column | Single column | Full nav in drawer |
| **<768px** | N/A — essentials view only | Not attempted (§7 of Doc 1, §22 of Doc 2) | Not attempted | N/A | N/A | N/A | Reduced essentials nav |

**Mechanism note:** every breakpoint transition above is CSS-media-query-driven (Doc 2's confirmed Tailwind default breakpoints — `sm/md/lg/xl`), not server-side device detection or a JS-computed viewport check on first render — this avoids a hydration mismatch between server-rendered and client-rendered layout state, which is the one concrete bug class this architectural choice specifically prevents.

---

## 22. Performance

- **Server rendering where appropriate:** default to Server Components for every read-only view (§1) — list pages, detail-page overview tabs, the dashboard's initial load. This is the primary performance lever available and costs nothing to apply by default.
- **Code splitting:** automatic per-route via the App Router; additionally, the Command Palette, Kanban board, and any chart library (§13) are dynamically imported (`next/dynamic`) so their client-side weight is never part of the initial shell bundle — these are exactly the surfaces most users won't touch on every page load.
- **Lazy loading:** below-the-fold dashboard widgets (§13) and detail-page tabs beyond the default-open one (§12) fetch on-demand (tab activation), not all at once on initial page load.
- **Image handling:** Next.js `<Image>` for any raster asset (avatars, uploaded document thumbnails if ever added) — not introduced speculatively; the current entity set has no image-heavy surface beyond user avatars.
- **Bundle boundaries:** the `features/<domain>/` structure (§8) is also a code-splitting boundary — a Finance-only user's session never needs to load CRM-specific components, and vice versa, if route-based splitting is respected (which it is, automatically, by the App Router).
- **Avoiding unnecessary client components:** stated as a rule, not a suggestion — a component is a Server Component unless it specifically needs interactivity/browser APIs/React state (§1). This is checked as part of the QA process (§25 of Doc 2's checklist is the template; this document doesn't duplicate it, but the principle is load-bearing here specifically because over-using `"use client"` is the single most common way a Next.js App Router app quietly loses its main performance advantage).
- **Avoiding unnecessary global state:** §9 — restated here because unnecessary global state is also a performance anti-pattern (broader re-render surfaces), not only an architectural cleanliness one.
- **Pagination:** never render an unbounded list — every table (§11) is paginated per its backend-defined strategy (cursor or offset, §7), with no "load everything" fallback anywhere.
- **Virtualization:** **only where justified** — a Kanban column or table with a genuinely large row count (hundreds+ visible without pagination, e.g. a very active project's Task board) may warrant row/card virtualization; this is **not built by default** across every list, since most of this application's tables are already bounded by pagination (above) and the stated data volumes (**Red Team §15**: "100k activities, 50k tasks... small for Postgres... a single well-indexed instance handles this comfortably") don't imply any single *rendered page* of data is large enough to need it. If a specific screen's real-world row count later proves otherwise, virtualization is added there specifically, not preemptively everywhere.

**No premature optimization:** consistent with the backend's own explicit posture (**Red Team §15**: "do not add Redis/Elasticsearch/Kafka at this volume — there is no concrete bottleneck these numbers would create"), the frontend does not pre-build caching layers, service workers, or virtualization for problems the stated scale doesn't yet have.

---

## 23. Security

The backend remains authoritative for every rule below — this section states what the frontend must never do, not a parallel enforcement layer.

- **No secrets in the client bundle:** no API keys, service-role tokens, storage credentials, or Razorpay secret keys ever appear in frontend code or environment variables prefixed for client exposure (e.g. no `NEXT_PUBLIC_*` variable holds anything more sensitive than a public, non-secret identifier like a Razorpay *publishable* key, if the checkout flow needs one client-side — the secret key never does).
- **No direct database access:** the frontend only ever talks to `/api/v1/...` (§7) — no direct Postgres/Prisma access from any frontend code, obviously, but stated explicitly since it's a security boundary, not just a layering convention.
- **No storage credentials:** restated from §16 — uploads/downloads go through backend-issued presigned URLs only.
- **Safe rendering of user content:** anything rendered that originated as free text from a user or client (Deal notes, Task titles, Proposal terms, Support Ticket subjects) is rendered as text, never as raw HTML (`dangerouslySetInnerHTML` is not used for any user-originated content anywhere in this application) — React's default escaping is the baseline protection and nothing in this application's feature set requires overriding it.
- **Safe file handling:** the frontend never infers a file's safety from its extension or its own MIME-type reading — it trusts only what the backend's upload-confirmation response says was validated (§16), and never sets a `Content-Disposition` or content-type on download that would allow browser execution of an uploaded file (this is a backend-enforced header per **Red Team §5.9**, but the frontend's download-link construction must not override or bypass it).
- **Auth/session handling:** session cookies are `httpOnly` (set by the backend, invisible to frontend JS by design) — the frontend never reads, stores, or manually attaches a session token; the browser's cookie handling does that automatically on same-site requests. This is the correct posture *because* it means a client-side XSS bug (however unlikely given the rendering rule above) cannot exfiltrate the session token, since frontend JS never has access to it in the first place.
- **CSRF:** the backend applies `SameSite=Strict` cookies + CSRF tokens on state-changing portal actions **(Red Team §5.5)** — for the internal OS specifically, the frozen documents don't call out CSRF as separately required beyond the portal, but the frontend's mutation layer (§6) is built to attach whatever CSRF token mechanism the backend requires (a header read from a meta tag or a dedicated endpoint) as a standard part of every mutating request, not bolted on only if remembered — exact mechanism **NOT CURRENTLY DEFINED** for the internal OS specifically, carried forward (§27).
- **XSS considerations:** covered by the "safe rendering" rule above; additionally, the Command Palette and any inline-search UI must not construct DOM from raw query strings (React's controlled-input + escaped-render model already prevents this by default — stated as a requirement, not a new mechanism to build).

---

## 24. Testing Architecture

No testing libraries are installed as part of this document — this section specifies **what should be tested at each level**, for implementation once approved.

| Level | Scope | What belongs here |
|---|---|---|
| **Unit testing** | Pure functions | `formatCurrency`, decimal-safe display math (§14), form-schema validation logic, domain `utils.ts` (§8) functions like "can this Deal move to Won" (UI-side mirror, §5) |
| **Component testing** | Individual primitives/composites in isolation (Doc 2 §11) | `Button` states, `Table` sorting/selection interaction, `StatusBadge` semantic-color mapping (§3 of Doc 2), `Field` label association |
| **Integration testing** | A feature module's components + hooks together, against a mocked API layer | A Deal detail page correctly rendering its masthead/tabs from a given API response shape; a form correctly mapping a mocked server error onto the right field (§10) |
| **Accessibility testing** | Automated (axe or equivalent) checks against key screens, plus manual keyboard-navigation passes | Every primitive from Doc 2 §11 at minimum; the Command Palette, Modal/Drawer focus-trap behavior, and every data Table specifically, since these are the highest-risk custom-interaction surfaces (§20) |
| **E2E testing** | Full user flows through a real (or realistic staging) backend | The "fast path" flow the backend's own UX red team names as the measure of the whole system's quality — **Lead → Qualify → Deal → Proposal → Send → Accept → Won → Project → Invoice → Payment → Milestones → Handover (Red Team §7)** — this single flow is the most valuable possible E2E test in the entire application, since the backend explicitly frames it as the system's core success criterion |

No specific library is named/assumed for any tier above (Vitest/Jest, React Testing Library, Playwright, axe-core are all reasonable, conventional choices for a Next.js app, but naming one here would be the same kind of silent-install risk §6/§10 already flag — left for an explicit, separate approval decision).

---

## 25. Folder Structure

```
app.forgebuilds.in/
├── app/
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── forgot-password/page.tsx
│   │   └── reset-password/page.tsx
│   ├── (workspace)/
│   │   ├── layout.tsx
│   │   ├── dashboard/page.tsx
│   │   ├── crm/
│   │   │   ├── leads/{page.tsx,[id]/page.tsx}
│   │   │   ├── companies/{page.tsx,[id]/page.tsx}
│   │   │   ├── contacts/{page.tsx,[id]/page.tsx}
│   │   │   └── deals/{page.tsx,[id]/page.tsx,error.tsx}
│   │   ├── projects/
│   │   │   ├── projects/{page.tsx,[id]/page.tsx}
│   │   │   ├── milestones/page.tsx
│   │   │   ├── tasks/page.tsx
│   │   │   ├── proposals/{page.tsx,[id]/page.tsx}
│   │   │   └── error.tsx
│   │   ├── finance/
│   │   │   ├── invoices/{page.tsx,[id]/page.tsx}
│   │   │   ├── payments/{page.tsx,[id]/page.tsx}
│   │   │   ├── expenses/page.tsx
│   │   │   ├── forge-fund/page.tsx
│   │   │   └── error.tsx
│   │   ├── team/
│   │   │   ├── members/{page.tsx,[id]/page.tsx}
│   │   │   ├── roles/page.tsx
│   │   │   └── workload/page.tsx
│   │   ├── settings/
│   │   │   ├── roles-permissions/page.tsx
│   │   │   ├── integrations/page.tsx
│   │   │   ├── templates/page.tsx
│   │   │   └── audit-log/page.tsx
│   │   └── notifications/page.tsx
│   ├── layout.tsx
│   ├── loading.tsx
│   ├── error.tsx
│   ├── global-error.tsx
│   └── not-found.tsx
│
├── features/                    — domain modules, mirrors backend module boundaries (§8)
│   ├── crm/{api,components,hooks,types.ts,utils.ts}
│   ├── sales/{api,components,hooks,types.ts,utils.ts}
│   ├── projects/{api,components,hooks,types.ts,utils.ts}
│   ├── finance/{api,components,hooks,types.ts,utils.ts}
│   ├── team/{api,components,hooks,types.ts,utils.ts}
│   └── shared/{api,components,hooks,types.ts,utils.ts}   — Activity, Note, Document,
│                                                             Notification, AuditLog
│
├── components/                  — PRIMITIVES + COMPOSITES only (Doc 2 §11/§23), no domain logic
│   ├── ui/                      Button, Input, Textarea, Select, Combobox, DatePicker,
│   │                            Checkbox, Radio, Switch, Badge, Avatar, Tooltip, Spinner,
│   │                            Skeleton, Progress
│   ├── overlays/                Modal, Drawer, Popover, Dropdown, CommandPalette,
│   │                            ConfirmationDialog, Toast
│   ├── data-display/            Table, Pagination, FilterBar, Tabs, Timeline, KPI,
│   │                            ChartContainer, Breadcrumb, EmptyState, StatusBadge
│   ├── forms/                   Field, FormSection, StickyFormActions
│   ├── navigation/               Sidebar, TopBar, AccountMenu, NotificationsPanel
│   └── brand/                   Logo, LogoMark, HoverArrow — reused unmodified from the
│                                 existing marketing codebase (Doc 1/2)
│
├── lib/
│   ├── api/                     shared low-level client: base URL, auth, error-envelope
│   │                            parsing (§7), idempotency-key injection (§7)
│   ├── query/                   query-key constants, cache config (§6, if TanStack Query
│   │                            is approved)
│   ├── auth/                    session-reading helpers (server + client), never shared
│   │                            with any ClientUser-equivalent code (§4)
│   └── format/                  formatCurrency, date formatting, tabular-nums helpers (§14)
│
├── hooks/                       — cross-cutting hooks not owned by one feature (e.g. a
│                                  generic useDebouncedValue used by both search and filters)
│
├── types/                       — shared types not owned by one feature (API envelope
│                                  shape, pagination cursor shape, the UserRole enum mirror)
│
├── styles/
│   └── globals.css              — Doc 2 §24's token inventory as CSS custom properties
│
└── tests/                       — structure mirrors features/ + components/, per §24
```

**No generic `components/` folder holds business logic** — every domain-aware component lives inside its owning `features/<domain>/components/`, per §8.

---

## 26. Implementation Order

Sequence only — **nothing in this document is implemented as part of producing it.**

1. **Foundation** — Next.js app scaffold, TypeScript config, ESLint/Prettier, the two-app decision (§1) confirmed with Forge before this step, environment/secrets handling (§23).
2. **Design tokens** — `styles/globals.css` implementing Doc 2 §24's inventory; the Archivo 400/500 font-weight addition (§27) resolved before this step, since the type scale depends on it.
3. **App shell** — Sidebar, TopBar, Breadcrumb, the `(workspace)` layout and its auth guard (§1/§3/§4), against static/mocked nav data — no real API calls yet.
4. **Authentication boundary** — real login flow, session handling, the `(auth)` route group, logout, expiry handling (§4) — the first point real backend endpoints are needed.
5. **Navigation** — full route tree scaffolded (§2) as empty/placeholder pages behind the now-real auth boundary, nav-tree role-gating (§5) wired to the real session.
6. **Data layer** — the API client (§7), the data-fetching approach decision finalized (§6 — TanStack Query approved or not), the first real entity (recommend `Company`/`Contact`/`Deal` — the CRM module, since it has the shallowest dependency chain per the backend's own module-boundary table, **Red Team §13**) wired end-to-end as the pattern reference for every module after it.
7. **Dashboard** — once at least CRM data is real (step 6), the dashboard's KPI/pipeline/tasks widgets (§13) can be built against genuinely real aggregate queries rather than placeholder shapes.
8. **CRM** — Leads, Companies, Contacts, Deals full list + detail pages (§11/§12), following the pattern established in step 6.
9. **Sales** — Proposals (§8's `sales` module), including the "Generate Invoice from Proposal" and "New Proposal from Deal" fast-path actions the backend's UX red team specifically calls out (§18/Red Team §7) as high-leverage command-palette entries.
10. **Projects** — Projects, Milestones, Tasks, TimeEntry, the "my open tasks" default view (§11/§13) — the single highest-frequency query, worth prioritizing its UX carefully.
11. **Finance** — Invoices, Payments, Refunds, CreditNotes, Expenses (§14) — the module with the most backend-side correctness weight (immutable snapshots, optimistic locking, idempotency), so its frontend forms/mutations (§10) deserve the most careful review against §7's contract before shipping.
12. **Team** — Members, Roles (enum-based, §2/§5), Workload (computed view) — explicitly **without** a Payouts screen (§15), pending the open modeling question in §27.
13. **Settings** — Roles & Permissions (thin, §2), Audit Log (real, backed by `AuditLog`); Integrations and Templates ship as placeholder/"coming soon" destinations only, since no backend entity exists for either (§2/§27) — do not build real functionality against invented data here.
14. **Cross-cutting features** — Command Palette (§18, with the ⌘K keybinding pending Forge approval per §27), Notifications center (§17), Documents/Activities/Notes tabs (§16, integrated into each detail page from step 8 onward rather than built as one late monolithic feature).
15. **Final polish** — responsive pass (§21), accessibility audit (§20/§24), performance pass (§22), the QA checklist from Doc 2 §25 run against every shipped screen.

---

## 27. Open Decisions

Every unresolved item carried forward from Doc 2, checked against the newly-available frozen architecture documents. Items marked **RESOLVED** were genuinely settled by information that wasn't available when Doc 2 was written — not re-decided here on this document's own authority, but traced to a specific citation. Everything else remains open.

| Item | Status | Detail |
|---|---|---|
| Archivo 400/500 weights | **Still open** | Not addressed by either backend document — remains a frontend font-loading/build decision requiring Forge sign-off before §26 step 2. |
| Semantic hue approval (success/danger/warning/info) | **Still open** | Computationally AA-validated (Doc 2 §3) but not backend-addressed — still needs a look before shipping, per Doc 2's original flag. |
| z-index scale | **Still open / net-new** | Frontend-only concern; no conflict with backend docs, but never formally approved by Forge either. |
| `⌘K` command-palette convention | **Still open, but now more informed** | The command palette *feature* is confirmed SHOULD HAVE (Red Team §20) and its two highest-value trigger points are named (Red Team §7) — but the exact keybinding itself remains **PROPOSED — REQUIRES FORGE APPROVAL** (§18), not resolved by the feature's validation. |
| Sidebar keyboard shortcut (collapse/expand) | **Still open** | Not addressed anywhere in either backend document. |
| Table select-all semantics (page vs. full filtered result set) | **Still open, with a recommendation** | Not addressed by either backend document. Given Red Team §8/§20's explicit "bulk actions... low frequency at 5-person scale, keep it simple" posture, this document recommends **page-scoped select-all only** for V1 (no "select all matching filter across all pages," which is also structurally awkward against cursor-paginated tables, §7/§11) — a recommendation, not a confirmed decision. |
| Toast auto-dismiss duration | **Still open** | Not addressed by either backend document — remains a UX-timing decision (Doc 2 §11 Toast). |
| Icon library | **Still open** | Not addressed by either backend document — Doc 2 §20's stroke/weight/size requirements stand, no specific library chosen. |
| Backend pagination strategy (cursor vs. offset) | **RESOLVED** | Red Team §8 and §15 explicitly name the split: cursor for `Activity`, `Task`, `Document`, `Contact`; offset for smaller/stable tables. Applied directly in §7/§11 of this document. |
| Entity-field gaps for record-detail pages | **Largely RESOLVED** | The full entity/field list from the Database Specification is now available and used directly in §12's masthead/key-facts/tabs table — this was the single biggest gap Doc 2 flagged, and it's now closed for the eleven entities this task specifies. |
| API details dependent on "Document 5" | **Partially RESOLVED** | No dedicated API specification document exists, but Red Team §13 provides real, usable API architecture (base path, error envelope, pagination split, filtering/sorting constraints, idempotency-key requirement, validation approach) — used throughout §7. Endpoint-by-endpoint paths, exact DTO shapes, and the full `error.code` enumeration remain genuinely undefined and still depend on a future specification. |
| **New, found while writing this document:** `TeamPayout` / payout workflow | **Open — flagged as a real gap, not resolved** | Doc 2's nav (§10) lists "Payouts" under Team; no `Payout`/`TeamPayout` entity, status enum, or workflow exists anywhere in the frozen Database Specification. This document explicitly omits a Payouts route (§2) and a payout workflow (§15) rather than inventing one, per the task's direct instruction. Whether team payouts should eventually be modeled as `ForgeFundEntry` WITHDRAWAL rows, or as a genuinely new entity, is an open modeling question for Forge to decide — not this document's call. |
| **New:** `Integration` entity for Settings → Integrations | **Open — flagged as a real gap** | No `Integration` entity exists in the frozen schema; Razorpay is the only integration and it's env-var/webhook-configured, not a manageable list. The route exists as a placeholder only (§2/§26). |
| **New:** `Template` entity for Settings → Templates | **Open — flagged as a real gap** | "Project templates" are described narratively in the DealWon automation (Red Team §3) but no `ProjectTemplate`/`MilestoneTemplate` table exists in the frozen schema. The route exists as a placeholder only (§2/§26). |
| **New:** `SavedView` entity | **Open — flagged as a real gap** | Saved views are confirmed SHOULD HAVE (Red Team §8/§20) for five specific tables, but no backing entity exists — §11 specifies a `localStorage`-only fallback as an explicit, documented downgrade, not a real implementation of the intended feature. |
| **New:** `Notification.payload` shape per `type` | **Open** | Needed to correctly resolve a notification's click-through navigation target (§17); not specified at the field level anywhere in the frozen documents. |
| **New:** two-application recommendation (`app.` vs `portal.` as separate Next.js apps) | **Open — recommendation requiring confirmation** | Strongly motivated by the backend's own session/JWT separation (Red Team §5.4) but not explicitly mandated by any task instruction — flagged in §1 as this document's recommendation, not an assumed decision. |
| **New:** CSRF mechanism for the internal OS specifically | **Open** | Red Team §5.5 specifies CSRF handling for portal state-changing actions explicitly; the internal OS isn't separately addressed. §23 specifies the frontend is built to attach whatever mechanism the backend requires, mechanism itself undefined. |
| **New:** Withdrawal/Allocation `amount` sign convention on the request payload | **Open** | The `ForgeFundEntry.amount` column is stored signed (negative for Withdrawal/Allocation) per the DB Spec, but whether the create-request DTO expects the client to send a signed or unsigned value is not specified (§15). |

None of the items above were silently resolved. Where a status is **RESOLVED**, the resolution is traced to a specific citation in the frozen documents, not decided by this document.

---

## Final Report

**A. File created:** `docs/FORGE-BUSINESS-OS-FRONTEND-ARCHITECTURE.md`

**B. Route groups defined:** `(auth)` (public — login, forgot-password, reset-password) and `(workspace)` (protected — Dashboard, CRM ×4, Projects ×4, Finance ×4, Team ×3, Settings ×4, Notifications), full tree in §2, built only from entities confirmed in the frozen Database Specification, with `/team/payouts` explicitly omitted (no backing entity) and `/settings/integrations` + `/settings/templates` explicitly marked placeholder-only (no backing entity for either).

**C. Frontend architecture defined:** App Router structure with server/client component boundaries, layouts, loading/error/not-found conventions, and auth-boundary placement (§1); app shell architecture for Sidebar/TopBar/Breadcrumbs/Search/Command Palette/Notifications/Account Menu (§3); domain feature structure mirroring the backend's own `crm`/`sales`/`projects`/`finance`/`team`/`shared` module boundaries with a strict primitives-vs-domain-components separation (§8); folder structure (§25); implementation sequence (§26).

**D. State/data architecture defined:** server state, URL state, local UI state, form state, and session state each assigned a single owning mechanism with no global store introduced for convenience (§9); data-fetching architecture covering server- and client-side fetching, caching/revalidation, mutations, optimistic updates (scoped away from financial mutations specifically), invalidation, and error handling, with TanStack Query explicitly flagged **PROPOSED — REQUIRES IMPLEMENTATION APPROVAL** rather than assumed (§6); the API contract layer built from Red Team §13's real conventions (error envelope, pagination split, idempotency-key requirement) with everything beyond that explicitly marked dependent on a not-yet-existing API specification (§7).

**E. Security boundaries defined:** frontend-as-convenience-layer authorization posture (never the security boundary) with explicit patterns for hidden/disabled actions, forbidden pages, and permission-aware nav/buttons (§5); authentication-state handling across unauthenticated/authenticated/expired/logged-out/forbidden states, with `User` and `ClientUser` kept structurally separate at the frontend layer too (§4); document/file handling with no storage credentials ever reaching the client bundle (§16); a dedicated security-rules section covering secrets, direct data access, safe content rendering, safe file handling, session-cookie handling, CSRF, and XSS (§23).

**F. Testing architecture defined:** five levels (unit, component, integration, accessibility, E2E) each scoped to concrete examples from this application's own feature set, with the backend's own named "Lead → Handover" fast-path flow identified as the highest-value E2E test — no testing library named or installed (§24).

**G. Open decisions:** eleven items carried forward from Doc 2 (re-verified against the now-available frozen architecture — two resolved: backend pagination strategy, and most of the entity-field gap; the rest remain open) plus seven newly-found gaps surfaced while writing this document — most notably that **no `TeamPayout`, `Integration`, `Template`, or `SavedView` entity exists anywhere in the frozen Database Specification**, despite each being implied by Doc 2's nav or the red team's UX guidance. Full table in §27.

**H. Confirmation that no application code was modified:** confirmed — this task produced exactly one new file, `docs/FORGE-BUSINESS-OS-FRONTEND-ARCHITECTURE.md`. No `package.json` was touched, no dependency was installed, no component or page was implemented.

**I. Confirmation that `/Users/atharva/Forge` was untouched:** confirmed — the existing marketing site's source files, configuration, and dependencies remain exactly as they were before this task began.

---

**DOCUMENT B3 FRONTEND ARCHITECTURE COMPLETE — READY FOR IMPLEMENTATION**
