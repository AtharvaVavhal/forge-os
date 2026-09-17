import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { SessionService } from "../src/modules/auth/services/session.service";

describe("Password reset (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("request always returns 204, for both a real and an unknown email (no enumeration)", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });

    const realEmailResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/request")
      .send({ email: fixture.email });
    const unknownEmailResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/request")
      .send({ email: "definitely-not-a-real-account@forge.local" });

    expect(realEmailResponse.status).toBe(204);
    expect(unknownEmailResponse.status).toBe(204);
    expect(realEmailResponse.body).toEqual({});
    expect(unknownEmailResponse.body).toEqual({});
  });

  it("valid reset: confirms with a signed token and the new password works to log in", async () => {
    const fixture = await createTestUser(app, { role: "SALES" });
    const sessionService = app.get(SessionService);
    const token = sessionService.signPasswordResetToken(fixture.id);

    const confirmResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: "a-brand-new-secure-password-1" });
    expect(confirmResponse.status).toBe(204);

    const loginResponse = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: "a-brand-new-secure-password-1" });
    expect(loginResponse.status).toBe(200);

    const oldPasswordLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    expect(oldPasswordLogin.status).toBe(401);
  });

  it("expired reset: a token past its TTL is rejected", async () => {
    const fixture = await createTestUser(app, { role: "OPERATIONS" });
    const { JwtService } = await import("@nestjs/jwt");
    const { ConfigService } = await import("@nestjs/config");
    const config = app.get(ConfigService);
    const jwt = new JwtService({});
    const expiredToken = jwt.sign(
      { sub: fixture.id, aud: "internal-password-reset" },
      { secret: config.get("auth.sessionJwtSigningKey"), expiresIn: "-1s" }
    );

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token: expiredToken, password: "some-new-password-123" });

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });

  it("reused reset: a second confirm with the same token after a successful reset is rejected", async () => {
    const fixture = await createTestUser(app, { role: "FINANCE" });
    const sessionService = app.get(SessionService);
    const token = sessionService.signPasswordResetToken(fixture.id);

    const first = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: "first-reset-password-123" });
    expect(first.status).toBe(204);

    // Wait a full second so `updated_at` (sub-second precision) is
    // unambiguously later than the token's second-precision `iat` — the
    // same reasoning as the session security-stamp test. This also
    // documents a real, minor, accepted limitation: a replay attempted
    // within the *same whole second* as the legitimate use would not be
    // caught by this mechanism. See docs/IMPLEMENTATION-PHASE-1.md.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const second = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: "second-reset-password-123" });

    expect(second.status).toBe(401);
    expect(second.body.error.code).toBe("PASSWORD_RESET_TOKEN_INVALID");
  });

  it("a reset token signed for an inactive user is rejected", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER", active: false });
    const sessionService = app.get(SessionService);
    const token = sessionService.signPasswordResetToken(fixture.id);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: "irrelevant-password-123" });

    expect(response.status).toBe(401);
  });

  it("the reset endpoint rejects a session JWT presented as a reset token (audience isolation)", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
    const sessionService = app.get(SessionService);
    const { token: sessionToken } = sessionService.signSession({
      userId: fixture.id,
      organizationId: fixture.organizationId,
      role: fixture.role,
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token: sessionToken, password: "irrelevant-password-123" });

    expect(response.status).toBe(401);
  });
});
