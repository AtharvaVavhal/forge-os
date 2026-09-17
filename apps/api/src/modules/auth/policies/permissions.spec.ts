import { PERMISSIONS, ROLE_PERMISSIONS, permissionsForRole, roleHasPermission } from "./permissions";

describe("permissions (Document 5 §4.2/§4.3 matrix)", () => {
  it("FOUNDER_ADMIN has every permission in the catalog (wildcard)", () => {
    for (const permission of PERMISSIONS) {
      expect(roleHasPermission("FOUNDER_ADMIN", permission)).toBe(true);
    }
    expect(permissionsForRole("FOUNDER_ADMIN")).toEqual(expect.arrayContaining([...PERMISSIONS]));
  });

  it("OPERATIONS has projects.manage but not finance.manage or crm.manage", () => {
    expect(roleHasPermission("OPERATIONS", "projects.manage")).toBe(true);
    expect(roleHasPermission("OPERATIONS", "finance.manage")).toBe(false);
    expect(roleHasPermission("OPERATIONS", "crm.manage")).toBe(false);
  });

  it("FINANCE has forge_fund.approve but not crm.manage or sales.manage", () => {
    expect(roleHasPermission("FINANCE", "forge_fund.approve")).toBe(true);
    expect(roleHasPermission("FINANCE", "finance.manage")).toBe(true);
    expect(roleHasPermission("FINANCE", "crm.manage")).toBe(false);
    expect(roleHasPermission("FINANCE", "sales.manage")).toBe(false);
  });

  it("SALES has crm.manage and portal.manage but not finance.read (Doc 5 §4.3 footnote 4)", () => {
    expect(roleHasPermission("SALES", "crm.manage")).toBe(true);
    expect(roleHasPermission("SALES", "portal.manage")).toBe(true);
    expect(roleHasPermission("SALES", "finance.read")).toBe(false);
  });

  it("TEAM_MEMBER has no forge_fund permission at all (Doc 5 §4.2 V1 default)", () => {
    expect(roleHasPermission("TEAM_MEMBER", "forge_fund.read")).toBe(false);
    expect(roleHasPermission("TEAM_MEMBER", "forge_fund.manage")).toBe(false);
    expect(roleHasPermission("TEAM_MEMBER", "forge_fund.approve")).toBe(false);
  });

  it("no non-FOUNDER_ADMIN role has audit.read except FINANCE (Doc 5 §4.3)", () => {
    expect(roleHasPermission("FINANCE", "audit.read")).toBe(true);
    expect(roleHasPermission("OPERATIONS", "audit.read")).toBe(false);
    expect(roleHasPermission("SALES", "audit.read")).toBe(false);
    expect(roleHasPermission("TEAM_MEMBER", "audit.read")).toBe(false);
  });

  it("every role in ROLE_PERMISSIONS is one of the five frozen UserRole values, no more, no fewer", () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual(
      ["FINANCE", "FOUNDER_ADMIN", "OPERATIONS", "SALES", "TEAM_MEMBER"].sort()
    );
  });

  it("every non-wildcard grant only contains permissions from the frozen catalog", () => {
    for (const grant of Object.values(ROLE_PERMISSIONS)) {
      if (grant === "*") continue;
      for (const permission of grant) {
        expect(PERMISSIONS).toContain(permission);
      }
    }
  });
});
