import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./csp";

const API_ORIGIN = "https://forge-os-ds4r.onrender.com";

function directive(csp: string, name: string): string | undefined {
  return csp.split("; ").find((d) => d === name || d.startsWith(`${name} `));
}

describe("buildContentSecurityPolicy", () => {
  const csp = buildContentSecurityPolicy(API_ORIGIN);

  it("allows R2 presigned uploads in connect-src", () => {
    expect(directive(csp, "connect-src")).toContain("https://*.r2.cloudflarestorage.com");
  });

  it("preserves the existing connect-src allowlist alongside R2", () => {
    expect(directive(csp, "connect-src")).toBe(
      "connect-src 'self' https://forge-os-ds4r.onrender.com https://api.razorpay.com " +
        "https://lumberjack.razorpay.com https://accounts.google.com https://*.r2.cloudflarestorage.com"
    );
  });

  it("does not add r2.cloudflarestorage.com to any directive other than connect-src", () => {
    for (const d of csp.split("; ")) {
      if (d.startsWith("connect-src")) continue;
      expect(d).not.toContain("r2.cloudflarestorage.com");
    }
  });

  it("never introduces a bare wildcard source", () => {
    expect(csp).not.toMatch(/(^|[\s])\*($|[\s;])/);
    expect(csp).not.toContain("https://*'");
  });

  it("only wildcards the R2 subdomain, not the whole host", () => {
    const wildcards = csp.match(/https:\/\/\*[^\s;]*/g) ?? [];
    expect(wildcards).toEqual(["https://*.r2.cloudflarestorage.com"]);
  });

  it("leaves other directives at their existing, non-weakened values", () => {
    expect(directive(csp, "default-src")).toBe("default-src 'self'");
    expect(directive(csp, "object-src")).toBe("object-src 'none'");
    expect(directive(csp, "frame-ancestors")).toBe("frame-ancestors 'none'");
    expect(directive(csp, "img-src")).toBe("img-src 'self' data: blob: https:");
    expect(directive(csp, "script-src")).toBe(
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com"
    );
  });
});

describe("buildSecurityHeaders", () => {
  it("includes a Content-Security-Policy header with the R2 connect-src entry", () => {
    const headers = buildSecurityHeaders(API_ORIGIN, "production");
    const csp = headers.find((h) => h.key === "Content-Security-Policy");
    expect(csp?.value).toContain("https://*.r2.cloudflarestorage.com");
  });

  it("adds HSTS only in production", () => {
    const dev = buildSecurityHeaders(API_ORIGIN, "development");
    const prod = buildSecurityHeaders(API_ORIGIN, "production");
    expect(dev.some((h) => h.key === "Strict-Transport-Security")).toBe(false);
    expect(prod.some((h) => h.key === "Strict-Transport-Security")).toBe(true);
  });
});
