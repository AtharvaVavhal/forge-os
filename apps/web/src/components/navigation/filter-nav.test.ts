import { describe, expect, it } from "vitest";
import { createAuthContext } from "@/test/test-utils";
import { filterNavTree, isNavItemVisible } from "./filter-nav";
import { NAV_TREE } from "./nav-tree";

describe("RBAC-aware navigation", () => {
  it("hides finance and roles from a team member when permissions are absent", () => {
    const tree = filterNavTree(createAuthContext({ role: "TEAM_MEMBER" }));
    const hrefs = tree.flatMap((group) => group.items.map((item) => item.href));

    expect(hrefs).toContain("/dashboard");
    expect(hrefs).toContain("/crm/leads");
    expect(hrefs).toContain("/team/workload");
    expect(hrefs).not.toContain("/finance/invoices");
    expect(hrefs).not.toContain("/settings/roles");
    expect(hrefs).not.toContain("/settings/audit-log");
  });

  it("shows finance to a finance role via visibleTo", () => {
    const tree = filterNavTree(createAuthContext({ role: "FINANCE" }));
    const hrefs = tree.flatMap((group) => group.items.map((item) => item.href));
    expect(hrefs).toContain("/finance/invoices");
    expect(hrefs).toContain("/finance/forge-fund");
    expect(hrefs).toContain("/settings/audit-log");
    expect(hrefs).not.toContain("/settings/roles");
  });

  it("lets backend permissions override visibleTo when present", () => {
    const sales = createAuthContext({
      role: "SALES",
      permissions: ["crm.read"],
    });
    const invoices = NAV_TREE.flatMap((group) => group.items).find((item) => item.id === "invoices");
    expect(invoices).toBeDefined();
    expect(isNavItemVisible(invoices!, sales)).toBe(false);

    const allowed = createAuthContext({
      role: "SALES",
      permissions: ["finance.read", "crm.read"],
    });
    expect(isNavItemVisible(invoices!, allowed)).toBe(true);
  });

  it("does not include payouts, integrations, templates, or saved views", () => {
    const hrefs = NAV_TREE.flatMap((group) => group.items.map((item) => item.href)).join(" ");
    expect(hrefs).not.toMatch(/payout/i);
    expect(hrefs).not.toMatch(/integration/i);
    expect(hrefs).not.toMatch(/template/i);
    expect(hrefs).not.toMatch(/saved-view/i);
  });
});
