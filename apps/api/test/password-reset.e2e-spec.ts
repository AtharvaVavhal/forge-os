import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { SessionService } from "../src/modules/auth/services/session.service";
import { PrismaService } from "../src/database/prisma.service";
import {
  mockSentEmails,
  queueMockResendError,
  resetMockResend,
} from "./__mocks__/resend";

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

  describe("F10.3 — password reset email (Resend)", () => {
    beforeEach(() => {
      resetMockResend();
    });

    it("sends a reset email to the account's own address via Resend with a reset URL and expiry", async () => {
      const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/password-reset/request")
        .send({ email: fixture.email });
      expect(response.status).toBe(204);

      expect(mockSentEmails).toHaveLength(1);
      const sent = mockSentEmails[0]!;
      expect(sent.to).toBe(fixture.email);
      expect(sent.from).toBe(process.env.EMAIL_FROM);
      expect(sent.subject).toMatch(/reset your forge password/i);
      expect(sent.html).toContain("/reset-password?token=");
      expect(sent.text).toContain("/reset-password?token=");
      expect(sent.text).toMatch(/expires in \d+ minutes/i);
    });

    it("never attempts a send for an unknown email, and the response stays identical either way (anti-enumeration)", async () => {
      const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });

      const realResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/password-reset/request")
        .send({ email: fixture.email });
      const sentForReal = mockSentEmails.length;

      resetMockResend();

      const unknownResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/password-reset/request")
        .send({ email: "definitely-not-a-real-account@forge.local" });

      expect(realResponse.status).toBe(unknownResponse.status);
      expect(realResponse.body).toEqual(unknownResponse.body);
      expect(sentForReal).toBe(1);
      expect(mockSentEmails).toHaveLength(0); // unknown email never reaches EmailService
    });

    it("the response stays 204/empty even when Resend fails — no silent false-success, no leak into the response", async () => {
      const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
      queueMockResendError({ message: "rate limited", name: "rate_limit_exceeded" });

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/password-reset/request")
        .send({ email: fixture.email });

      expect(response.status).toBe(204);
      expect(response.body).toEqual({});

      const prisma = app.get(PrismaService);
      const failureEvent = await prisma.auditLog.findFirst({
        where: {
          entity_type: "User",
          entity_id: fixture.id,
          action: "auth.password_reset_email_failed",
        },
      });
      expect(failureEvent).not.toBeNull();
    });

    it("the email body never contains the API key", async () => {
      const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });

      await request(app.getHttpServer())
        .post("/api/v1/auth/password-reset/request")
        .send({ email: fixture.email });

      const sent = mockSentEmails.at(-1)!;
      expect(JSON.stringify(sent)).not.toContain(process.env.RESEND_API_KEY!);
    });
  });
});
