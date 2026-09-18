import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { PrismaService } from "../src/database/prisma.service";

describe("Onboarding (e2e)", () => {
  let app: INestApplication;
  let founderCookie: string;
  let founderCsrf: string;

  beforeAll(async () => {
    app = await createTestApp();
    const fixture = await createTestUser(app, { role: "FOUNDER_ADMIN" });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    const setCookie = login.headers["set-cookie"] as unknown as string[];
    founderCookie = extractCookie(setCookie, "forge_session")!;
    founderCsrf = extractCookie(setCookie, "forge_csrf")!;
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  async function createTeamInvite(email: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${founderCookie}; forge_csrf=${founderCsrf}`)
      .set("X-CSRF-Token", founderCsrf)
      .send({ scope: "TEAM", email, userRole: "TEAM_MEMBER" });
    expect(response.status).toBe(201);
    return response.body as {
      invitation: { id: string; email: string };
      token: string;
    };
  }

  describe("POST /invitations/preview", () => {
    it("returns Gate fields for a valid TEAM invitation without consuming it", async () => {
      const email = `phase1-e2e-preview-valid-${Date.now()}@forge.local`;
      const { token, invitation } = await createTeamInvite(email);

      const preview = await request(app.getHttpServer())
        .post("/api/v1/invitations/preview")
        .send({ token });

      expect(preview.status).toBe(200);
      expect(preview.body.email).toBe(email);
      expect(preview.body.role).toBe("TEAM_MEMBER");
      expect(typeof preview.body.inviterName).toBe("string");
      expect(typeof preview.body.organizationName).toBe("string");
      expect(preview.body.token).toBeUndefined();
      expect(preview.body.tokenHash).toBeUndefined();
      expect(preview.body.token_hash).toBeUndefined();

      const prisma = app.get(PrismaService);
      const row = await prisma.invitationToken.findUniqueOrThrow({ where: { id: invitation.id } });
      expect(row.used_at).toBeNull();
    });

    it("rejects invalid / expired / used / revoked with the same generic code", async () => {
      const invalid = await request(app.getHttpServer())
        .post("/api/v1/invitations/preview")
        .send({ token: "0".repeat(64) });
      expect(invalid.status).toBe(400);
      expect(invalid.body.error.code).toBe("INVITATION_INVALID");

      const email = `phase1-e2e-preview-expired-${Date.now()}@forge.local`;
      const { token, invitation } = await createTeamInvite(email);
      const prisma = app.get(PrismaService);
      await prisma.invitationToken.update({
        where: { id: invitation.id },
        data: { expires_at: new Date(Date.now() - 1000) },
      });
      const expired = await request(app.getHttpServer())
        .post("/api/v1/invitations/preview")
        .send({ token });
      expect(expired.status).toBe(400);
      expect(expired.body.error.code).toBe("INVITATION_INVALID");

      const email2 = `phase1-e2e-preview-used-${Date.now()}@forge.local`;
      const usedInvite = await createTeamInvite(email2);
      await request(app.getHttpServer())
        .post("/api/v1/invitations/accept")
        .send({ token: usedInvite.token });
      const used = await request(app.getHttpServer())
        .post("/api/v1/invitations/preview")
        .send({ token: usedInvite.token });
      expect(used.status).toBe(400);
      expect(used.body.error.code).toBe("INVITATION_INVALID");
      await prisma.user.deleteMany({ where: { email: email2 } });

      const email3 = `phase1-e2e-preview-revoked-${Date.now()}@forge.local`;
      const revokedInvite = await createTeamInvite(email3);
      await request(app.getHttpServer())
        .post(`/api/v1/invitations/${revokedInvite.invitation.id}/revoke`)
        .set("Cookie", `forge_session=${founderCookie}; forge_csrf=${founderCsrf}`)
        .set("X-CSRF-Token", founderCsrf);
      const revoked = await request(app.getHttpServer())
        .post("/api/v1/invitations/preview")
        .send({ token: revokedInvite.token });
      expect(revoked.status).toBe(400);
      expect(revoked.body.error.code).toBe("INVITATION_INVALID");
    });
  });

  describe("POST /auth/onboarding/complete", () => {
    it("rejects unauthenticated and CSRF-invalid requests", async () => {
      const unauth = await request(app.getHttpServer()).post("/api/v1/auth/onboarding/complete");
      expect(unauth.status).toBe(401);

      const fixture = await createTestUser(app, { role: "FOUNDER_ADMIN", onboarded: false });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const setCookie = login.headers["set-cookie"] as unknown as string[];
      const session = extractCookie(setCookie, "forge_session")!;
      const csrf = extractCookie(setCookie, "forge_csrf")!;

      const noCsrf = await request(app.getHttpServer())
        .post("/api/v1/auth/onboarding/complete")
        .set("Cookie", `forge_session=${session}; forge_csrf=${csrf}`);
      expect(noCsrf.status).toBe(403);
      expect(noCsrf.body.error.code).toBe("CSRF_TOKEN_INVALID");
    });

    it("FOUNDER_ADMIN: sets onboardedAt, re-issues session, and is idempotent", async () => {
      const fixture = await createTestUser(app, { role: "FOUNDER_ADMIN", onboarded: false });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const setCookie = login.headers["set-cookie"] as unknown as string[];
      const session = extractCookie(setCookie, "forge_session")!;
      const csrf = extractCookie(setCookie, "forge_csrf")!;

      const meBefore = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${session}`);
      expect(meBefore.status).toBe(200);
      expect(meBefore.body.onboardedAt).toBeNull();
      expect(meBefore.body.active).toBe(true);

      const complete = await request(app.getHttpServer())
        .post("/api/v1/auth/onboarding/complete")
        .set("Cookie", `forge_session=${session}; forge_csrf=${csrf}`)
        .set("X-CSRF-Token", csrf);
      expect(complete.status).toBe(200);
      expect(complete.body.onboardedAt).toBeTruthy();

      const newCookies = complete.headers["set-cookie"] as unknown as string[] | undefined;
      expect(newCookies).toBeTruthy();
      const newSession = extractCookie(newCookies, "forge_session")!;
      expect(newSession).toBeTruthy();
      expect(newSession).not.toBe(session);

      // Old session is stamped out (B9 H1).
      const stale = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${session}`);
      expect(stale.status).toBe(401);

      const meAfter = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${newSession}`);
      expect(meAfter.status).toBe(200);
      expect(meAfter.body.onboardedAt).toBeTruthy();

      const newCsrf = extractCookie(newCookies, "forge_csrf")!;
      const again = await request(app.getHttpServer())
        .post("/api/v1/auth/onboarding/complete")
        .set("Cookie", `forge_session=${newSession}; forge_csrf=${newCsrf}`)
        .set("X-CSRF-Token", newCsrf);
      expect(again.status).toBe(200);
      expect(again.body.onboardedAt).toBe(meAfter.body.onboardedAt);

      // Idempotent path must not invalidate the current session.
      const stillValid = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Cookie", `forge_session=${newSession}`);
      expect(stillValid.status).toBe(200);
    });

    it("SALES (non-team) onboarding still works without KYC/payout", async () => {
      const fixture = await createTestUser(app, { role: "SALES", onboarded: false });
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: fixture.email, password: fixture.password });
      const setCookie = login.headers["set-cookie"] as unknown as string[];
      const session = extractCookie(setCookie, "forge_session")!;
      const csrf = extractCookie(setCookie, "forge_csrf")!;

      const complete = await request(app.getHttpServer())
        .post("/api/v1/auth/onboarding/complete")
        .set("Cookie", `forge_session=${session}; forge_csrf=${csrf}`)
        .set("X-CSRF-Token", csrf);
      expect(complete.status).toBe(200);
      expect(complete.body.onboardedAt).toBeTruthy();
    });
  });

  describe("passwordless TEAM accept", () => {
    it("creates an SSO-ready User without requiring a password", async () => {
      const email = `phase1-e2e-accept-sso-${Date.now()}@forge.local`;
      const { token } = await createTeamInvite(email);

      const accept = await request(app.getHttpServer())
        .post("/api/v1/invitations/accept")
        .send({ token });
      expect(accept.status).toBe(200);

      const prisma = app.get(PrismaService);
      const user = await prisma.user.findFirstOrThrow({ where: { email } });
      expect(user.password_hash).toBeNull();
      expect(user.onboarded_at).toBeNull();
      expect(user.active).toBe(true);

      await prisma.user.delete({ where: { id: user.id } });
    });
  });
});
