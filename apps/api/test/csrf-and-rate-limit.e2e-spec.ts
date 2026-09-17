import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";

describe("CSRF (e2e)", () => {
  let app: INestApplication;
  let sessionCookie: string;
  let csrfCookie: string;

  beforeAll(async () => {
    app = await createTestApp();
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    sessionCookie = extractCookie(setCookie, "forge_session")!;
    csrfCookie = extractCookie(setCookie, "forge_csrf")!;
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("valid request: matching cookie + header succeeds", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", [`forge_session=${sessionCookie}`, `forge_csrf=${csrfCookie}`])
      .set("X-CSRF-Token", csrfCookie);

    expect(response.status).toBe(204);
  });

  it("missing token: no X-CSRF-Token header at all is rejected", async () => {
    const fixture2 = await createTestUser(app, { role: "TEAM_MEMBER" });
    const login2 = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture2.email, password: fixture2.password });
    const setCookie2 = login2.headers["set-cookie"] as unknown as string[];
    const session2 = extractCookie(setCookie2, "forge_session")!;
    const csrf2 = extractCookie(setCookie2, "forge_csrf")!;

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", [`forge_session=${session2}`, `forge_csrf=${csrf2}`]);
    // No X-CSRF-Token header set.

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("invalid token: a header present but not matching the cookie is rejected", async () => {
    const fixture3 = await createTestUser(app, { role: "TEAM_MEMBER" });
    const login3 = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture3.email, password: fixture3.password });
    const setCookie3 = login3.headers["set-cookie"] as unknown as string[];
    const session3 = extractCookie(setCookie3, "forge_session")!;
    const csrf3 = extractCookie(setCookie3, "forge_csrf")!;

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", [`forge_session=${session3}`, `forge_csrf=${csrf3}`])
      .set("X-CSRF-Token", "a-value-that-does-not-match-the-cookie");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  it("safe methods (GET) never require a CSRF token", async () => {
    const fixture4 = await createTestUser(app, { role: "TEAM_MEMBER" });
    const login4 = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture4.email, password: fixture4.password });
    const session4 = extractCookie(
      login4.headers["set-cookie"] as unknown as string[],
      "forge_session"
    )!;

    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `forge_session=${session4}`);
    // No CSRF header at all — GET is a safe method, exempt by design.

    expect(response.status).toBe(200);
  });

  it("public routes (login itself) never require a CSRF token", async () => {
    const fixture5 = await createTestUser(app, { role: "TEAM_MEMBER" });
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture5.email, password: fixture5.password });
    // No CSRF cookie/header exists yet at login time — there is no
    // established session for a forged request to ride on.

    expect(response.status).toBe(200);
  });
});

// Rate-limit *behavior* (proving a 429 actually happens) lives in its own
// file, `rate-limit-behavior.e2e-spec.ts` — it needs to set an explicit,
// small `RATE_LIMIT_LOGIN_MAX` *before* `AppModule` (and therefore the
// `@Throttle(...)`-decorated `AuthController`) is ever imported, which
// this file's static top-level `bootstrap` import (used by the CSRF tests
// above) would otherwise have already locked in. See that file's header
// comment for the full explanation.
