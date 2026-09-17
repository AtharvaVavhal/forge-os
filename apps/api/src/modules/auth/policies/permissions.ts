import type { UserRole } from "@prisma/client";

/**
 * Permission catalog — Document 5 §4.2, verbatim. `resource.action` format.
 * This is the complete, frozen list. Do not add a permission that doesn't
 * trace back to this table, and do not add a role that isn't one of the
 * five frozen `UserRole` values.
 */
export const PERMISSIONS = [
  "users.read",
  "users.manage",
  "crm.read",
  "crm.manage",
  "sales.read",
  "sales.manage",
  "projects.read",
  "projects.manage",
  "finance.read",
  "finance.manage",
  "forge_fund.read",
  "forge_fund.manage",
  "forge_fund.approve",
  "documents.read",
  "documents.manage",
  "audit.read",
  "portal.manage",
  "team.workload.read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Default role → permission matrix — Document 5 §4.3, verbatim.
 *
 * `'*'` (FOUNDER_ADMIN only) means every permission in `PERMISSIONS`,
 * matching Document 5's own `*` notation exactly rather than listing all
 * eighteen permissions out by hand (which would be the same set, just
 * harder to keep in sync if the catalog above ever changes).
 *
 * Several permissions below are deliberately **absent** for a role even
 * though a naive reading of the underlying resource might suggest
 * otherwise — these are frozen, documented defaults, not omissions:
 *   - SALES has no `finance.read` (Doc 5 §4.3 footnote 4: "V1: deny unless
 *     FOUNDER_ADMIN widens (avoid finance leak). Default: SALES has no
 *     finance.read.")
 *   - TEAM_MEMBER has no `forge_fund.read` at all (Doc 5 §4.2: "V1
 *     default: TEAM_MEMBER has no Forge Fund read unless granted via
 *     FOUNDER_ADMIN operational practice").
 *   - OPERATIONS has no `finance.*`, `forge_fund.*`, `sales.manage`,
 *     `crm.manage`, or `portal.manage`.
 *
 * Scoped/limited permissions the matrix marks "limited"/"assigned"/"own"
 * (Doc 5 §4.3 footnotes ¹–⁴) are **not** expressible as a flat permission
 * grant — they require row-level context (e.g. "only tasks assigned to
 * me") that doesn't exist until a real resource is being authorized
 * against. Those roles still receive the base permission below (so the
 * route is reachable at all); the row-level narrowing is Step 11's
 * "resource authorization" layer, applied per-resource once a real
 * resource exists (Phase 2+) — see resource-authorization.ts.
 */
export const ROLE_PERMISSIONS: Record<UserRole, ReadonlySet<Permission> | "*"> = {
  FOUNDER_ADMIN: "*",
  OPERATIONS: new Set<Permission>([
    "crm.read",
    "sales.read",
    "projects.read",
    "projects.manage",
    "documents.manage",
    "team.workload.read",
  ]),
  FINANCE: new Set<Permission>([
    "crm.read",
    "sales.read",
    "projects.read",
    "finance.read",
    "finance.manage",
    "forge_fund.read",
    "forge_fund.manage",
    "forge_fund.approve",
    "documents.manage",
    "audit.read",
  ]),
  SALES: new Set<Permission>([
    "crm.read",
    "crm.manage",
    "sales.read",
    "sales.manage",
    "projects.read",
    "documents.manage",
    "portal.manage",
  ]),
  TEAM_MEMBER: new Set<Permission>([
    "crm.read",
    "projects.read",
    "documents.manage",
    "team.workload.read",
  ]),
};

/** True if `role` grants `permission`, honoring the FOUNDER_ADMIN wildcard. */
export function roleHasPermission(role: UserRole, permission: Permission): boolean {
  const grant = ROLE_PERMISSIONS[role];
  return grant === "*" || grant.has(permission);
}

/** The full, expanded permission list for a role — used by `GET /auth/permissions`. */
export function permissionsForRole(role: UserRole): Permission[] {
  const grant = ROLE_PERMISSIONS[role];
  return grant === "*" ? [...PERMISSIONS] : [...grant];
}
