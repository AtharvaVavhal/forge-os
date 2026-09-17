import type { INestApplication } from "@nestjs/common";

/**
 * Proves the login throttle actually returns 429, using a small, explicit,
 * deterministic limit — set via `process.env` *before* `AppModule` (and
 * therefore `AuthController`'s `@Throttle(loginThrottle())` decorator) is
 * ever imported.
 *
 * This has to be its own file and use dynamic `import()` rather than a
 * static top-level `import`: `rate-limits.ts`'s `@Throttle(...)` argument
 * is computed once, at decorator-evaluation time (module import time) —
 * before any `beforeAll` in any test file has a chance to run. A static
 * `import { createTestApp } from "./support/bootstrap"` at the top of
 * this file would transitively import `AppModule` immediately on file
 * load, locking in whatever `RATE_LIMIT_LOGIN_MAX` (or its `NODE_ENV=test`
 * -bumped default, see rate-limits.ts) happened to be set at that moment
 * — too early for this test's own override to apply. Setting the env var
 * first, then dynamically importing, guarantees the decorator reads the
 * value this test actually wants.
 */
describe("Rate limiting — 429 behavior (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.RATE_LIMIT_LOGIN_MAX = "3";
    process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS = "60";

    const { createTestApp } = await import("./support/bootstrap");
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.RATE_LIMIT_LOGIN_MAX;
    delete process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS;
  });

  it("returns 429 once the configured attempt count is exceeded within the window", async () => {
    const request = (await import("supertest")).default;

    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "rate-limit-probe@forge.local", password: "wrong-password" });
      statuses.push(response.status);
    }

    // First 3 (the configured RATE_LIMIT_LOGIN_MAX) are genuine credential
    // failures; everything after that is throttled before credential
    // checking even runs.
    expect(statuses.slice(0, 3)).toEqual([401, 401, 401]);
    expect(statuses.slice(3)).toEqual([429, 429, 429]);
  });
});
