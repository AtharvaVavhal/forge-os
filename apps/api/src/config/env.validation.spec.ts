import { validate } from "./env.validation";

describe("validate (environment configuration)", () => {
  it("accepts a minimal valid configuration and applies defaults", () => {
    const result = validate({ DATABASE_URL: "postgresql://localhost:5432/db" });
    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(4000);
    expect(result.DATABASE_URL).toBe("postgresql://localhost:5432/db");
  });

  it("rejects a configuration missing DATABASE_URL", () => {
    expect(() => validate({})).toThrow(/Invalid environment configuration/);
  });

  it("rejects an out-of-range PORT", () => {
    expect(() =>
      validate({ DATABASE_URL: "postgresql://localhost:5432/db", PORT: "99999" })
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects an unrecognized NODE_ENV", () => {
    expect(() =>
      validate({ DATABASE_URL: "postgresql://localhost:5432/db", NODE_ENV: "staging" })
    ).toThrow(/Invalid environment configuration/);
  });

  it("accepts an explicit valid PORT and NODE_ENV", () => {
    const result = validate({
      DATABASE_URL: "postgresql://localhost:5432/db",
      NODE_ENV: "production",
      PORT: "8080",
    });
    expect(result.NODE_ENV).toBe("production");
    expect(result.PORT).toBe(8080);
  });
});
