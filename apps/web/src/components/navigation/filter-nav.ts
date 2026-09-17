import type { InternalAuthContext } from "@/features/auth/types";
import { hasPermission, hasRole } from "@/features/auth/authorization/authorization";
import { NAV_TREE, type NavGroup, type NavItem } from "./nav-tree";

/**
 * UX-only nav filtering (Doc B3 §5). If the backend sent permissions, those
 * win for items that declare a permission. Otherwise `visibleTo` is used.
 */
export function isNavItemVisible(item: NavItem, auth: InternalAuthContext): boolean {
  if (item.permission && auth.permissions !== undefined) {
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
