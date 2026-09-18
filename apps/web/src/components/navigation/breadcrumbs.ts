import type { BreadcrumbItem } from "@/components/data-display/breadcrumb";
import { flattenNavItems, NAV_TREE } from "./nav-tree";

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  crm: "CRM",
  leads: "Leads",
  companies: "Companies",
  contacts: "Contacts",
  deals: "Deals",
  projects: "Projects",
  milestones: "Milestones",
  tasks: "Tasks",
  "time-entries": "Time Entries",
  proposals: "Proposals",
  finance: "Finance",
  invoices: "Invoices",
  payments: "Payments",
  expenses: "Expenses",
  "forge-fund": "Forge Fund",
  "tax-rates": "Tax rates",
  team: "Team",
  members: "Members",
  workload: "Workload",
  settings: "Settings",
  organization: "Organization",
  roles: "Roles",
  "audit-log": "Audit log",
  profile: "Profile",
  notifications: "Notifications",
  unauthorized: "Unavailable",
};

export function breadcrumbsFromPathname(pathname: string): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ label: "Dashboard", href: "/dashboard" }];
  }

  const navMatch = flattenNavItems(NAV_TREE).find((item) => item.href === pathname);
  if (navMatch && segments.length === 1) {
    return [{ label: navMatch.label }];
  }

  return segments.map((segment, index) => {
    const href = `/${segments.slice(0, index + 1).join("/")}`;
    const last = index === segments.length - 1;
    return {
      label: SEGMENT_LABELS[segment] ?? segment,
      href: last ? undefined : href,
    };
  });
}
