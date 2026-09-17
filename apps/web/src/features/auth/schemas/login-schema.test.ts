import { describe, expect, it } from "vitest";
import { validateLoginForm } from "./login-schema";

describe("validateLoginForm", () => {
  it("requires email and password", () => {
    expect(validateLoginForm({ email: "", password: "" })).toEqual({
      email: "Enter your email.",
      password: "Enter your password.",
    });
  });

  it("rejects an invalid email", () => {
    expect(validateLoginForm({ email: "not-an-email", password: "secret" })).toEqual({
      email: "Enter a valid email address.",
    });
  });

  it("accepts a valid payload", () => {
    expect(validateLoginForm({ email: "atharva@forgebuilds.in", password: "secret" })).toEqual({});
  });
});
