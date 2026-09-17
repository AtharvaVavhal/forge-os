import { describe, expect, it } from "vitest";
import { breadcrumbsFromPathname } from "./breadcrumbs";

describe("breadcrumbs", () => {
  it("maps frozen routes to labels", () => {
    expect(breadcrumbsFromPathname("/dashboard")).toEqual([{ label: "Dashboard" }]);
    expect(breadcrumbsFromPathname("/crm/leads")).toEqual([
      { label: "CRM", href: "/crm" },
      { label: "Leads" },
    ]);
    expect(breadcrumbsFromPathname("/finance/forge-fund")).toEqual([
      { label: "Finance", href: "/finance" },
      { label: "Forge Fund" },
    ]);
    expect(breadcrumbsFromPathname("/settings/audit-log")).toEqual([
      { label: "Settings", href: "/settings" },
      { label: "Audit log" },
    ]);
    expect(breadcrumbsFromPathname("/notifications")).toEqual([{ label: "Notifications" }]);
  });
});
