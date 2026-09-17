import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { PrismaService } from "../src/database/prisma.service";

describe("Invitations (e2e)", () => {
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

  async function createInvitation(email: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${founderCookie}; forge_csrf=${founderCsrf}`)
      .set("X-CSRF-Token", founderCsrf)
      .send({ scope: "TEAM", email, userRole: "TEAM_MEMBER" });
    expect(response.status).toBe(201);
    return response.body as { invitation: { id: string }; token: string };
  }

  it("valid token: accepting creates a User and marks the token used", async () => {
    const email = "phase1-e2e-invite-valid@forge.local";
    const { token, invitation } = await createInvitation(email);

    const acceptResponse = await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token, password: "a-perfectly-good-password-123" });

    expect(acceptResponse.status).toBe(200);
    expect(acceptResponse.body.email).toBe(email);

    const prisma = app.get(PrismaService);
    const row = await prisma.invitationToken.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.used_at).not.toBeNull();

    const createdUser = await prisma.user.findFirst({ where: { email } });
    expect(createdUser).not.toBeNull();
    expect(createdUser?.role).toBe("TEAM_MEMBER");

    await prisma.user.deleteMany({ where: { email } });
  });

  it("invalid token: a well-formed but nonexistent token is rejected generically", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token: "0".repeat(64), password: "whatever-password-123" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVITATION_INVALID");
  });

  it("expired token: rejected generically, same as an invalid one", async () => {
    const email = "phase1-e2e-invite-expired@forge.local";
    const { token, invitation } = await createInvitation(email);

    const prisma = app.get(PrismaService);
    await prisma.invitationToken.update({
      where: { id: invitation.id },
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token, password: "whatever-password-123" });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVITATION_INVALID");
  });

  it("reused token: a second accept attempt after a successful one is rejected", async () => {
    const email = "phase1-e2e-invite-reused@forge.local";
    const { token } = await createInvitation(email);

    const first = await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token, password: "first-use-password-123" });
    expect(first.status).toBe(200);

    const second = await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token, password: "second-use-password-123" });
    expect(second.status).toBe(400);
    expect(second.body.error.code).toBe("INVITATION_INVALID");

    const prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });
  });

  it("revoked token: rejected generically after revocation", async () => {
    const email = "phase1-e2e-invite-revoked@forge.local";
    const { token, invitation } = await createInvitation(email);

    const revokeResponse = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .set("Cookie", `forge_session=${founderCookie}; forge_csrf=${founderCsrf}`)
      .set("X-CSRF-Token", founderCsrf);
    expect(revokeResponse.status).toBe(204);

    const acceptResponse = await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token, password: "whatever-password-123" });
    expect(acceptResponse.status).toBe(400);
    expect(acceptResponse.body.error.code).toBe("INVITATION_INVALID");
  });

  it("revoking an already-used invitation is rejected (409)", async () => {
    const email = "phase1-e2e-invite-already-used@forge.local";
    const { token, invitation } = await createInvitation(email);
    await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token, password: "whatever-password-123" });

    const revokeResponse = await request(app.getHttpServer())
      .post(`/api/v1/invitations/${invitation.id}/revoke`)
      .set("Cookie", `forge_session=${founderCookie}; forge_csrf=${founderCsrf}`)
      .set("X-CSRF-Token", founderCsrf);

    expect(revokeResponse.status).toBe(409);

    const prisma = app.get(PrismaService);
    await prisma.user.deleteMany({ where: { email } });
  });

  it("the raw token is never persisted — only its hash", async () => {
    const email = "phase1-e2e-invite-hash-only@forge.local";
    const { token, invitation } = await createInvitation(email);

    const prisma = app.get(PrismaService);
    const row = await prisma.invitationToken.findUniqueOrThrow({ where: { id: invitation.id } });
    expect(row.token_hash).not.toBe(token);
    expect(row.token_hash).toHaveLength(64); // SHA-256 hex digest
  });
});
