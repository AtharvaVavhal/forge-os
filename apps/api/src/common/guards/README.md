# Guards — reserved for Phase 1

This directory intentionally contains no guards yet.

Per Implementation Phase 0's instructions and Document 6 (Auth/RBAC/Security
Specification), authentication and authorization are **not implemented in
Phase 0**. The guards this directory will hold, per Document 6 §8's RBAC
enforcement stack, are:

- `@InternalAuth()` — validates a `forge_session` cookie, `aud: internal` JWT.
- `@PortalAuth()` — validates a `portal_session` cookie, `aud: portal` JWT.
- `PortalScopeGuard` — applied module-wide to every `/api/v1/portal/*`
  controller (Document 6 §9.1), never per-handler.
- `RolesGuard` / a `@RequirePermissions(...)` decorator + guard pair,
  enforcing the frozen `UserRole` → permission matrix (Document 6 §2, §4).

None of these exist yet. Until they do, every route in this API is
effectively unauthenticated — that is expected and correct for Phase 0, and
is why no domain module (CRM, Sales, Projects, Finance, Team, Portal) is
implemented in this phase either: building business endpoints ahead of the
guards that must protect them would ship an unauthenticated financial API.

**AUTH/RBAC IMPLEMENTATION COMES IN PHASE 1.**
