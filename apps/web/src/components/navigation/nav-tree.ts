import type { UserRole } from "@forge/types";
import { USER_ROLES } from "@forge/types";
import type { NAV_ICONS } from "@/components/icons";

export type NavIconKey = keyof typeof NAV_ICONS;

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: NavIconKey;
  /**
   * UX convenience only (Doc B3 §5). Backend remains authoritative.
   * When omitted, the item is visible to every internal role.
   */
  visibleTo?: readonly UserRole[];
  /** Optional backend permission string; used when the session includes permissions. */
  permission?: string;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

const ALL_ROLES = USER_ROLES;

const FINANCE_ROLES = ["FOUNDER_ADMIN", "FINANCE"] as const satisfies readonly UserRole[];
const WORKLOAD_ROLES = ["FOUNDER_ADMIN", "OPERATIONS", "TEAM_MEMBER"] as const satisfies readonly UserRole[];
const TIME_ENTRY_ROLES = [
  "FOUNDER_ADMIN",
  "OPERATIONS",
  "FINANCE",
  "TEAM_MEMBER",
] as const satisfies readonly UserRole[];
const ADMIN_ROLES = ["FOUNDER_ADMIN"] as const satisfies readonly UserRole[];

/**
 * Frozen Phase 2 workspace navigation. Payouts, Integrations, Templates,
 * and Saved Views are intentionally omitted.
 */
export const NAV_TREE: NavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    items: [
      {
        id: "dashboard",
        label: "Dashboard",
        href: "/dashboard",
        icon: "dashboard",
        visibleTo: ALL_ROLES,
      },
    ],
  },
  {
    id: "crm",
    label: "CRM",
    items: [
      { id: "leads", label: "Leads", href: "/crm/leads", icon: "leads", visibleTo: ALL_ROLES, permission: "crm.read" },
      {
        id: "companies",
        label: "Companies",
        href: "/crm/companies",
        icon: "companies",
        visibleTo: ALL_ROLES,
        permission: "crm.read",
      },
      {
        id: "contacts",
        label: "Contacts",
        href: "/crm/contacts",
        icon: "contacts",
        visibleTo: ALL_ROLES,
        permission: "crm.read",
      },
      { id: "deals", label: "Deals", href: "/crm/deals", icon: "deals", visibleTo: ALL_ROLES, permission: "crm.read" },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    items: [
      {
        id: "projects",
        label: "Projects",
        href: "/projects",
        icon: "projects",
        visibleTo: ALL_ROLES,
        permission: "projects.read",
      },
      {
        id: "milestones",
        label: "Milestones",
        href: "/projects/milestones",
        icon: "milestones",
        visibleTo: ALL_ROLES,
        permission: "projects.read",
      },
      {
        id: "tasks",
        label: "Tasks",
        href: "/projects/tasks",
        icon: "tasks",
        visibleTo: ALL_ROLES,
        permission: "projects.read",
      },
      {
        id: "time-entries",
        label: "Time Entries",
        href: "/projects/time-entries",
        icon: "timeEntries",
        visibleTo: TIME_ENTRY_ROLES,
        permission: "projects.read",
      },
      {
        id: "proposals",
        label: "Proposals",
        href: "/projects/proposals",
        icon: "proposals",
        visibleTo: ALL_ROLES,
        permission: "sales.read",
      },
    ],
  },
  {
    id: "finance",
    label: "Finance",
    items: [
      {
        id: "invoices",
        label: "Invoices",
        href: "/finance/invoices",
        icon: "invoices",
        visibleTo: FINANCE_ROLES,
        permission: "finance.read",
      },
      {
        id: "payments",
        label: "Payments",
        href: "/finance/payments",
        icon: "payments",
        visibleTo: FINANCE_ROLES,
        permission: "finance.read",
      },
      {
        id: "expenses",
        label: "Expenses",
        href: "/finance/expenses",
        icon: "expenses",
        visibleTo: FINANCE_ROLES,
        permission: "finance.read",
      },
      {
        id: "forge-fund",
        label: "Forge Fund",
        href: "/finance/forge-fund",
        icon: "forgeFund",
        visibleTo: FINANCE_ROLES,
        permission: "forge_fund.read",
      },
      {
        id: "tax-rates",
        label: "Tax rates",
        href: "/finance/tax-rates",
        icon: "invoices",
        visibleTo: FINANCE_ROLES,
        permission: "finance.read",
      },
    ],
  },
  {
    id: "team",
    label: "Team",
    items: [
      {
        id: "members",
        label: "Members",
        href: "/team/members",
        icon: "members",
        visibleTo: ALL_ROLES,
        permission: "users.read",
      },
      {
        id: "workload",
        label: "Workload",
        href: "/team/workload",
        icon: "workload",
        visibleTo: WORKLOAD_ROLES,
        permission: "team.workload.read",
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    items: [
      {
        id: "organization",
        label: "Organization",
        href: "/settings/organization",
        icon: "organization",
        visibleTo: ALL_ROLES,
      },
      {
        id: "roles",
        label: "Roles",
        href: "/settings/roles",
        icon: "roles",
        visibleTo: ADMIN_ROLES,
        permission: "users.manage",
      },
      {
        id: "audit-log",
        label: "Audit log",
        href: "/settings/audit-log",
        icon: "auditLog",
        visibleTo: FINANCE_ROLES,
        permission: "audit.read",
      },
      {
        id: "profile",
        label: "Profile",
        href: "/settings/profile",
        icon: "profile",
        visibleTo: ALL_ROLES,
      },
    ],
  },
];

export function isNavItemActive(pathname: string, href: string, tree: NavGroup[] = NAV_TREE): boolean {
  if (pathname === href) return true;
  if (!pathname.startsWith(`${href}/`)) return false;
  return !flattenNavItems(tree).some(
    (item) =>
      item.href !== href &&
      item.href.startsWith(`${href}/`) &&
      (pathname === item.href || pathname.startsWith(`${item.href}/`))
  );
}

export function flattenNavItems(tree: NavGroup[] = NAV_TREE): NavItem[] {
  return tree.flatMap((group) => group.items);
}
