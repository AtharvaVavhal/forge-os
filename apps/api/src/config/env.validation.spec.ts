import { validate } from "./env.validation";

const VALID_SIGNING_KEY = "unit-test-signing-key-at-least-32-characters-long";

const minimalValidConfig = {
  DATABASE_URL: "postgresql://localhost:5432/db",
  SESSION_JWT_SIGNING_KEY: VALID_SIGNING_KEY,
};

describe("validate (environment configuration)", () => {
  it("accepts a minimal valid configuration and applies defaults", () => {
    const result = validate(minimalValidConfig);
    expect(result.NODE_ENV).toBe("development");
    expect(result.PORT).toBe(4000);
    expect(result.DATABASE_URL).toBe("postgresql://localhost:5432/db");
    expect(result.SESSION_JWT_TTL_SECONDS).toBe(43_200);
    expect(result.PASSWORD_HASH_COST_FACTOR).toBe(12);
    expect(result.PASSWORD_RESET_TOKEN_TTL_SECONDS).toBe(1_800);
    expect(result.INVITATION_TOKEN_TTL_DAYS).toBe(7);
  });

  it("rejects a configuration missing DATABASE_URL", () => {
    expect(() => validate({ SESSION_JWT_SIGNING_KEY: VALID_SIGNING_KEY })).toThrow(
      /Invalid environment configuration/
    );
  });

  it("rejects a configuration missing SESSION_JWT_SIGNING_KEY", () => {
    expect(() => validate({ DATABASE_URL: "postgresql://localhost:5432/db" })).toThrow(
      /Invalid environment configuration/
    );
  });

  it("rejects a SESSION_JWT_SIGNING_KEY shorter than 32 characters", () => {
    expect(() =>
      validate({ ...minimalValidConfig, SESSION_JWT_SIGNING_KEY: "too-short" })
    ).toThrow(/Invalid environment configuration/);
  });

  it("rejects an out-of-range PORT", () => {
    expect(() => validate({ ...minimalValidConfig, PORT: "99999" })).toThrow(
      /Invalid environment configuration/
    );
  });

  it("rejects an unrecognized NODE_ENV", () => {
    expect(() => validate({ ...minimalValidConfig, NODE_ENV: "staging" })).toThrow(
      /Invalid environment configuration/
    );
  });

  it("accepts an explicit valid PORT and NODE_ENV", () => {
    const result = validate({
      ...minimalValidConfig,
      NODE_ENV: "production",
      PORT: "8080",
    });
    expect(result.NODE_ENV).toBe("production");
    expect(result.PORT).toBe(8080);
  });

  it("accepts explicit Phase 1 overrides", () => {
    const result = validate({
      ...minimalValidConfig,
      SESSION_JWT_TTL_SECONDS: "3600",
      PASSWORD_HASH_COST_FACTOR: "13",
      RATE_LIMIT_LOGIN_MAX: "10",
    });
    expect(result.SESSION_JWT_TTL_SECONDS).toBe(3600);
    expect(result.PASSWORD_HASH_COST_FACTOR).toBe(13);
    expect(result.RATE_LIMIT_LOGIN_MAX).toBe(10);
  });
});
