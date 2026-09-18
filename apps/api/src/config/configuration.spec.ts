import configuration from "./configuration";

const REQUIRED_ENV = {
  DATABASE_URL: "postgresql://localhost:5432/db",
  SESSION_JWT_SIGNING_KEY: "unit-test-signing-key-at-least-32-characters-long",
};

const EMAIL_KEYS = ["RESEND_API_KEY", "EMAIL_FROM"] as const;

describe("configuration() — email (F10.3)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ...REQUIRED_ENV };
    for (const key of EMAIL_KEYS) delete process.env[key];
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("is unconfigured when neither RESEND_API_KEY nor EMAIL_FROM is set", () => {
    const config = configuration();
    expect(config.email.configured).toBe(false);
    expect(config.email.apiKey).toBeUndefined();
    expect(config.email.from).toBeUndefined();
  });

  it("is configured when both RESEND_API_KEY and EMAIL_FROM are set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "FORGE <noreply@forgebuilds.in>";
    const config = configuration();
    expect(config.email.configured).toBe(true);
    expect(config.email.apiKey).toBe("re_test_key");
    expect(config.email.from).toBe("FORGE <noreply@forgebuilds.in>");
  });

  it("throws at boot when only RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    expect(() => configuration()).toThrow(/Email configuration is incomplete/);
  });

  it("throws at boot when only EMAIL_FROM is set", () => {
    process.env.EMAIL_FROM = "FORGE <noreply@forgebuilds.in>";
    expect(() => configuration()).toThrow(/Email configuration is incomplete/);
  });
});

describe("configuration() — trust proxy (F10.4)", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, ...REQUIRED_ENV };
    delete process.env.TRUST_PROXY;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("defaults to false in development", () => {
    process.env.NODE_ENV = "development";
    expect(configuration().trustProxy).toBe(false);
  });

  it("defaults to 1 hop in production", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.forgebuilds.in";
    expect(configuration().trustProxy).toBe(1);
  });

  it("rejects TRUST_PROXY=true", () => {
    process.env.NODE_ENV = "production";
    process.env.CORS_ORIGINS = "https://app.forgebuilds.in";
    process.env.TRUST_PROXY = "true";
    expect(() => configuration()).toThrow(/hop count/);
  });
});
