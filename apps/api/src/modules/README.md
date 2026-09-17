# Domain modules — not implemented in Phase 0

This directory fixes the location for the eight modules Document 5 §1
defines: `auth`, `crm`, `sales`, `projects`, `finance`, `team`, `portal`,
`shared`. It is intentionally empty.

Phase 0 establishes the foundation these modules will be built on
(bootstrap, config, Prisma wiring, error envelope, request-id/logging
foundation, CORS, health checks) — it does not implement any of them.
Building a domain module ahead of the auth/RBAC guards in
`../common/guards/` would ship an unauthenticated business/financial API,
which is explicitly out of scope here.

Each future module should follow Document 5 §1's dependency rules exactly:

| Module | May depend on | Must not |
| --- | --- | --- |
| `auth` | — | Depend on any domain module |
| `crm` | `shared`, `auth` (read-only) | Import `finance` or `projects` |
| `sales` | `crm` (read Deal), `shared` | Import `finance` |
| `projects` | `crm` (read), `sales` (read accepted Proposal), `shared` | Import `finance` |
| `finance` | `projects` (read), `crm` (read Company), `shared` | Import `sales` directly — use invoice snapshots only |
| `team` | `projects` (read), `finance` (read) | Own separate payout tables (none exist) |
| `portal` | Read-only query services from `crm`/`sales`/`projects`/`finance` | Expose internal write services |
| `shared` | Nothing domain-specific | Be imported *from* by everyone; import no domain modules |
