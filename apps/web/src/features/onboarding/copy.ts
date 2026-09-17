import type { UserRole } from "@forge/types";

/** Display labels for The Mirror role line (uppercase · FORGE). */
export const ONBOARDING_ROLE_LABEL: Record<UserRole, string> = {
  TEAM_MEMBER: "TEAM MEMBER",
  OPERATIONS: "OPERATIONS",
  SALES: "SALES",
  FINANCE: "FINANCE",
  FOUNDER_ADMIN: "FOUNDER ADMIN",
};

/** One-line Orientation copy by role (V2). */
export const ONBOARDING_ORIENTATION_COPY: Record<UserRole, string> = {
  TEAM_MEMBER: "Projects. Time. Payouts. Everything in one system.",
  OPERATIONS: "Team. Projects. Finance. The full operating picture.",
  SALES: "Leads. Clients. Pipeline. One system, no switching.",
  FINANCE: "Invoices. Payouts. Fund. Complete financial control.",
  FOUNDER_ADMIN: "Everything. Everyone. The entire operation.",
};

export function roleTitleForInvite(role: UserRole): string {
  return ONBOARDING_ROLE_LABEL[role]
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
