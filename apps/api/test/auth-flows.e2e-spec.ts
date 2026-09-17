import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";

describe("Auth flows (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  describe("valid login", () => {
    it("returns the session user and sets forge_session + forge_csrf cookies", async () => {
      const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });

      expect(response.status).toBe(200);
      expect(response.body.email).toBe(fixture.email);
      expect(response.body.role).toBe("TEAM_MEMBER");
      // Never leak the hash over the wire.
      expect(response.body.password_hash).toBeUndefined();
      expect(response.body.password).toBeUndefined();

      const setCookie = response.headers["set-cookie"] as unknown as string[];
      expect(extractCookie(setCookie, "forge_session")).toBeTruthy();
      expect(extractCookie(setCookie, "forge_csrf")).toBeTruthy();

      const sessionCookieLine = setCookie.find((c) => c.startsWith("forge_session="));
      expect(sessionCookieLine).toContain("HttpOnly");
      expect(sessionCookieLine).toContain("SameSite=Strict");

      const csrfCookieLine = setCookie.find((c) => c.startsWith("forge_csrf="));
      // CSRF cookie must NOT be httpOnly — the frontend needs to read it.
      expect(csrfCookieLine).not.toContain("HttpOnly");
    });
  });

  describe("invalid login", () => {
    it("rejects a wrong password with a generic message", async () => {
      const fixture = await createTestUser(app, { role: "SALES" });

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: "definitely-wrong-password" });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe("Invalid email or password.");
      expect(response.body.error.requestId).toBeTruthy();
    });

    it("rejects an unknown email with the identical generic message", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "no-such-user@forge.local", password: "whatever-1234" });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe("Invalid email or password.");
    });

    it("rejects a malformed request body (DTO validation)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: "not-an-email", password: "" });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("BAD_REQUEST");
    });
  });

  describe("inactive user", () => {
    it("rejects login for an inactive user with the same generic message", async () => {
      const fixture = await createTestUser(app, { role: "OPERATIONS", active: false });

      const response = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toBe("Invalid email or password.");
    });

    it("rejects an already-issued session the instant the user is deactivated", async () => {
      const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const sessionCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_session"
      );

      // Confirm the session works before deactivation.
      const before = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${sessionCookie}`);
      expect(before.status).toBe(200);

      const { PrismaService } = await import("../src/database/prisma.service");
      await app.get(PrismaService).user.update({
        where: { id: fixture.id },
        data: { active: false },
      });

      const after = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${sessionCookie}`);
      expect(after.status).toBe(401);
    });
  });

  describe("logout", () => {
    it("clears the session cookie and the cleared session can no longer authenticate", async () => {
      const fixture = await createTestUser(app, { role: "FINANCE" });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const sessionCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_session"
      );
      const csrfCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_csrf"
      );

      const logoutResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Cookie", [`forge_session=${sessionCookie}`, `forge_csrf=${csrfCookie}`])
        .set("X-CSRF-Token", csrfCookie ?? "");

      expect(logoutResponse.status).toBe(204);
      const clearedCookie = (logoutResponse.headers["set-cookie"] as unknown as string[]).find(
        (c) => c.startsWith("forge_session=")
      );
      expect(clearedCookie).toMatch(/forge_session=;/);
    });

    it("B9 H1: invalidates retained forge_session JWT after logout (security stamp)", async () => {
      const fixture = await createTestUser(app, { role: "SALES" });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const sessionCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_session"
      );
      const csrfCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_csrf"
      );

      await new Promise((resolve) => setTimeout(resolve, 50));

      await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Cookie", [`forge_session=${sessionCookie}`, `forge_csrf=${csrfCookie}`])
        .set("X-CSRF-Token", csrfCookie ?? "")
        .expect(204);

      const after = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${sessionCookie}`);
      expect(after.status).toBe(401);
    });

    it("B9 M7: auth identity endpoints set Cache-Control: no-store", async () => {
      const fixture = await createTestUser(app, { role: "FINANCE" });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const sessionCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_session"
      );

      const me = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${sessionCookie}`);
      expect(me.status).toBe(200);
      expect(String(me.headers["cache-control"] ?? "")).toMatch(/no-store/i);
    });
  });

  describe("expired/revoked session", () => {
    it("rejects a JWT signed with the wrong signing key (simulated tamper/expiry equivalent)", async () => {
      const { JwtService } = await import("@nestjs/jwt");
      const jwt = new JwtService({});
      const forged = jwt.sign(
        { sub: "00000000-0000-4000-8000-000000000099", org: "x", role: "FOUNDER_ADMIN", aud: "internal" },
        { secret: "not-the-real-signing-key", expiresIn: "1h" }
      );

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${forged}`);

      expect(response.status).toBe(401);
    });

    it("rejects a session that predates a password change (security-stamp fence)", async () => {
      const fixture = await createTestUser(app, { role: "SALES" });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const sessionCookie = extractCookie(
        login.headers["set-cookie"] as unknown as string[],
        "forge_session"
      );

      // A small gap so the next update's `updated_at` is unambiguously
      // later than the token's `iatMs` — millisecond-precision on both
      // sides (see jwt-auth.guard.ts), so this no longer needs to cross a
      // whole-second boundary the way a naive `iat` comparison would.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const { PrismaService } = await import("../src/database/prisma.service");
      const { PasswordService } = await import(
        "../src/modules/auth/services/password.service"
      );
      const newHash = await app.get(PasswordService).hash("a-brand-new-password-123");
      await app.get(PrismaService).user.update({
        where: { id: fixture.id },
        data: { password_hash: newHash },
      });

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${sessionCookie}`);

      expect(response.status).toBe(401);
    });
  });

  describe("protected endpoint without authentication", () => {
    it("rejects /auth/me with no session cookie at all", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
      expect(response.body.error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects /auth/session with no session cookie", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/auth/session");
      expect(response.status).toBe(401);
    });

    it("rejects POST /invitations with no session cookie", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/invitations")
        .send({ scope: "TEAM", email: "someone@forge.local", userRole: "SALES" });
      expect(response.status).toBe(401);
    });
  });
});
