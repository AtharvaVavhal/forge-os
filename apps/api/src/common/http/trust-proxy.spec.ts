import { resolveTrustProxyHops } from "./trust-proxy";

describe("resolveTrustProxyHops", () => {
  it("defaults to 1 hop in production when unset", () => {
    expect(resolveTrustProxyHops("production", undefined)).toBe(1);
    expect(resolveTrustProxyHops("production", "")).toBe(1);
  });

  it("defaults to false outside production when unset", () => {
    expect(resolveTrustProxyHops("development", undefined)).toBe(false);
    expect(resolveTrustProxyHops("test", undefined)).toBe(false);
  });

  it("accepts an explicit hop count", () => {
    expect(resolveTrustProxyHops("production", "1")).toBe(1);
    expect(resolveTrustProxyHops("development", "2")).toBe(2);
  });

  it("allows disabling with false/0", () => {
    expect(resolveTrustProxyHops("production", "false")).toBe(false);
    expect(resolveTrustProxyHops("production", "0")).toBe(false);
  });

  it("rejects trust-all true", () => {
    expect(() => resolveTrustProxyHops("production", "true")).toThrow(/hop count/);
  });

  it("rejects out-of-range hop counts", () => {
    expect(() => resolveTrustProxyHops("production", "6")).toThrow(/1 to 5/);
    expect(() => resolveTrustProxyHops("production", "-1")).toThrow(/1 to 5/);
    expect(() => resolveTrustProxyHops("production", "abc")).toThrow(/1 to 5/);
  });
});
