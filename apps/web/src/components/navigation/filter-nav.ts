import type { InternalAuthContext } from "@/features/auth/types";
import { hasPermission, hasRole } from "@/features/auth/authorization/authorization";
import { NAV_TREE, type NavGroup, type NavItem } from "./nav-tree";

/**
 * UX-only nav filtering (Doc B3 §5). Backend remains authoritative.
 *
 * When an item declares `permission`:
 * - permissions array present → honor `hasPermission`
 * - permissions undefined → fail closed (hide), matching `Can`
 * When no permission is declared, fall back to `visibleTo` roles.
 */
export function isNavItemVisible(item: NavItem, auth: InternalAuthContext): boolean {
  if (item.permission) {
    if (auth.permissions === undefined) return false;
    return hasPermission(auth, item.permission);
  }
  if (item.visibleTo) {
    return hasRole(auth, [...item.visibleTo]);
  }
  return true;
}

export function filterNavTree(auth: InternalAuthContext, tree: NavGroup[] = NAV_TREE): NavGroup[] {
  return tree
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => isNavItemVisible(item, auth)),
    }))
    .filter((group) => group.items.length > 0);
}
