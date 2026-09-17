import type { UserRole } from "@forge/types";
import type { InternalAuthContext } from "../types";

export interface AuthorizationQuery {
  permission?: string;
  role?: UserRole | UserRole[];
}

export function hasRole(context: InternalAuthContext, role: UserRole | UserRole[]): boolean {
  const allowed = Array.isArray(role) ? role : [role];
  return allowed.includes(context.user.role);
}

/**
 * Permission check against backend-provided strings only.
 *
 * Fails closed when `permissions` is undefined — the frontend does not
 * invent a role→permission matrix (Doc B3 §5). Wildcards the backend may
 * send (`*` or `resource.*`) are honored; nothing else is inferred.
 */
export function hasPermission(context: InternalAuthContext, permission: string): boolean {
  const permissions = context.permissions;
  if (!permissions) return false;
  if (permissions.includes("*")) return true;
  if (permissions.includes(permission)) return true;

  const separator = permission.indexOf(".");
  if (separator > 0) {
    const resourceWildcard = `${permission.slice(0, separator)}.*`;
    if (permissions.includes(resourceWildcard)) return true;
  }

  return false;
}

export function isAuthorized(context: InternalAuthContext, query: AuthorizationQuery): boolean {
  const roleOk = query.role ? hasRole(context, query.role) : true;
  const permissionOk = query.permission ? hasPermission(context, query.permission) : true;
  return roleOk && permissionOk;
}
