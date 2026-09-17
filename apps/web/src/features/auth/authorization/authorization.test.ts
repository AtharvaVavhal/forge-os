import { describe, expect, it } from "vitest";
import { createAuthContext } from "@/test/test-utils";
import { hasPermission, hasRole, isAuthorized } from "./authorization";

describe("authorization helpers", () => {
  it("matches the five frozen roles", () => {
    const context = createAuthContext({ role: "FINANCE" });
    expect(hasRole(context, "FINANCE")).toBe(true);
    expect(hasRole(context, ["FOUNDER_ADMIN", "FINANCE"])).toBe(true);
    expect(hasRole(context, "SALES")).toBe(false);
  });

  it("fails closed when the backend has not provided permissions", () => {
    const context = createAuthContext({ permissions: undefined });
    expect(hasPermission(context, "finance.manage")).toBe(false);
  });

  it("honors backend-provided permission strings and wildcards", () => {
    const exact = createAuthContext({ permissions: ["finance.manage"] });
    const wildcard = createAuthContext({ permissions: ["finance.*"] });
    const star = createAuthContext({ permissions: ["*"] });

    expect(hasPermission(exact, "finance.manage")).toBe(true);
    expect(hasPermission(exact, "crm.manage")).toBe(false);
    expect(hasPermission(wildcard, "finance.read")).toBe(true);
    expect(hasPermission(star, "audit.read")).toBe(true);
  });

  it("requires both role and permission when both are specified", () => {
    const context = createAuthContext({
      role: "SALES",
      permissions: ["crm.manage"],
    });
    expect(isAuthorized(context, { role: "SALES", permission: "crm.manage" })).toBe(true);
    expect(isAuthorized(context, { role: "FINANCE", permission: "crm.manage" })).toBe(false);
  });
});
