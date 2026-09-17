import { describe, expect, it } from "vitest";
import { parseAuthContext } from "./parse-auth-payload";

describe("parseAuthContext", () => {
  it("reads a nested user + permissions payload", () => {
    const parsed = parseAuthContext({
      user: {
        id: "user-1",
        organization_id: "org-1",
        email: "atharva@forgebuilds.in",
        name: "Atharva",
        role: "FOUNDER_ADMIN",
        active: true,
      },
      permissions: ["finance.manage", "crm.read"],
    });

    expect(parsed).toMatchObject({
      user: {
        id: "user-1",
        organizationId: "org-1",
        role: "FOUNDER_ADMIN",
      },
      permissions: ["finance.manage", "crm.read"],
    });
  });

  it("reads a bare user object", () => {
    const parsed = parseAuthContext({
      id: "user-2",
      email: "ops@forgebuilds.in",
      name: "Ops",
      role: "OPERATIONS",
    });

    expect(parsed?.user.role).toBe("OPERATIONS");
    expect(parsed?.permissions).toBeUndefined();
  });

  it("returns null when role is missing rather than inventing one", () => {
    expect(
      parseAuthContext({
        id: "user-3",
        email: "nobody@forgebuilds.in",
        name: "Nobody",
      })
    ).toBeNull();
  });

  it("rejects unknown roles instead of coercing them", () => {
    expect(
      parseAuthContext({
        id: "user-4",
        email: "x@forgebuilds.in",
        name: "X",
        role: "CUSTOMER",
      })
    ).toBeNull();
  });
});
