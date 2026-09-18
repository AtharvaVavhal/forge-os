import { describe, expect, it } from "vitest";
import { resolveRewriteApiOrigin } from "./resolve-rewrite-origin";

describe("resolveRewriteApiOrigin", () => {
  it("uses the origin of a valid absolute API base URL", () => {
    expect(resolveRewriteApiOrigin("https://api.forgebuilds.in/api/v1", "production")).toBe(
      "https://api.forgebuilds.in"
    );
  });

  it("fails closed in production when unset", () => {
    expect(() => resolveRewriteApiOrigin(undefined, "production")).toThrow(
      /NEXT_PUBLIC_API_BASE_URL must be set/
    );
  });

  it("fails closed in production when invalid", () => {
    expect(() => resolveRewriteApiOrigin("not-a-url", "production")).toThrow(
      /NEXT_PUBLIC_API_BASE_URL must be set/
    );
  });

  it("falls back to localhost outside production", () => {
    expect(resolveRewriteApiOrigin(undefined, "development")).toBe("http://localhost:4000");
  });
});
