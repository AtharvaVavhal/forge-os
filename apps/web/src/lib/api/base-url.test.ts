import { describe, expect, it } from "vitest";
import { API_PREFIX, normalizeApiBaseUrl } from "./base-url";

describe("normalizeApiBaseUrl", () => {
  it("appends /api/v1 when the env value is origin-only", () => {
    expect(normalizeApiBaseUrl("https://forge-os-ds4r.onrender.com")).toBe(
      `https://forge-os-ds4r.onrender.com${API_PREFIX}`
    );
    expect(normalizeApiBaseUrl("https://forge-os-ds4r.onrender.com/")).toBe(
      `https://forge-os-ds4r.onrender.com${API_PREFIX}`
    );
  });

  it("preserves a correctly suffixed /api/v1 base without a trailing slash", () => {
    expect(normalizeApiBaseUrl("https://forge-os-ds4r.onrender.com/api/v1")).toBe(
      "https://forge-os-ds4r.onrender.com/api/v1"
    );
    expect(normalizeApiBaseUrl("https://forge-os-ds4r.onrender.com/api/v1/")).toBe(
      "https://forge-os-ds4r.onrender.com/api/v1"
    );
  });

  it("forces /api/v1 when an unexpected path is present", () => {
    expect(normalizeApiBaseUrl("https://api.example.com/v2")).toBe("https://api.example.com/api/v1");
  });

  it("joins auth paths under /api/v1 after normalization", () => {
    const base = normalizeApiBaseUrl("https://forge-os-ds4r.onrender.com");
    const withSlash = base.endsWith("/") ? base : `${base}/`;
    expect(new URL("auth/me", withSlash).toString()).toBe(
      "https://forge-os-ds4r.onrender.com/api/v1/auth/me"
    );
    expect(new URL("auth/session", withSlash).toString()).toBe(
      "https://forge-os-ds4r.onrender.com/api/v1/auth/session"
    );
  });
});
