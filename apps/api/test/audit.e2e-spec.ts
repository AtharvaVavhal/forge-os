import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { PrismaService } from "../src/database/prisma.service";

describe("Audit logging (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("records a Tier A event on successful login", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
    const prisma = app.get(PrismaService);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });

    const entry = await prisma.auditLog.findFirst({
      where: { actor_id: fixture.id, action: "auth.login_succeeded" },
      orderBy: { created_at: "desc" },
    });
    expect(entry).not.toBeNull();
    expect(entry?.entity_type).toBe("User");
    expect(entry?.entity_id).toBe(fixture.id);
  });

  it("records a failed-login event distinct from a successful one", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
    const prisma = app.get(PrismaService);

    await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: "wrong-password-on-purpose" });

    const entry = await prisma.auditLog.findFirst({
      where: { actor_id: fixture.id, action: "auth.login_failed" },
      orderBy: { created_at: "desc" },
    });
    expect(entry).not.toBeNull();
  });

  it("records logout", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
    const login = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    const setCookie = login.headers["set-cookie"] as unknown as string[];

    await request(app.getHttpServer())
      .post("/api/v1/auth/logout")
      .set("Cookie", [
        `forge_session=${extractCookie(setCookie, "forge_session")}`,
        `forge_csrf=${extractCookie(setCookie, "forge_csrf")}`,
      ])
      .set("X-CSRF-Token", extractCookie(setCookie, "forge_csrf") ?? "");

    const prisma = app.get(PrismaService);
    const entry = await prisma.auditLog.findFirst({
      where: { actor_id: fixture.id, action: "auth.logout" },
    });
    expect(entry).not.toBeNull();
  });

  it("records invitation creation, acceptance, and revocation", async () => {
    const founder = await createTestUser(app, { role: "FOUNDER_ADMIN" });
    const founderLogin = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: founder.email, password: founder.password });
    const setCookie = founderLogin.headers["set-cookie"] as unknown as string[];
    const cookie = extractCookie(setCookie, "forge_session")!;
    const csrf = extractCookie(setCookie, "forge_csrf")!;
    const prisma = app.get(PrismaService);

    const created = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${cookie}; forge_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf)
      .send({
        scope: "TEAM",
        email: "phase1-e2e-audit-invite@forge.local",
        userRole: "TEAM_MEMBER",
      });
    const invitationId = created.body.invitation.id as string;

    const createdEvent = await prisma.auditLog.findFirst({
      where: { entity_type: "InvitationToken", entity_id: invitationId, action: "invitation.created" },
    });
    expect(createdEvent).not.toBeNull();

    await request(app.getHttpServer())
      .post("/api/v1/invitations/accept")
      .send({ token: created.body.token, password: "audit-test-password-123" });

    const acceptedEvent = await prisma.auditLog.findFirst({
      where: { entity_type: "InvitationToken", entity_id: invitationId, action: "invitation.accepted" },
    });
    expect(acceptedEvent).not.toBeNull();

    // A second, fresh invitation to exercise revocation distinctly from acceptance.
    const created2 = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${cookie}; forge_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf)
      .send({
        scope: "TEAM",
        email: "phase1-e2e-audit-invite-2@forge.local",
        userRole: "TEAM_MEMBER",
      });
    await request(app.getHttpServer())
      .post(`/api/v1/invitations/${created2.body.invitation.id}/revoke`)
      .set("Cookie", `forge_session=${cookie}; forge_csrf=${csrf}`)
      .set("X-CSRF-Token", csrf);

    const revokedEvent = await prisma.auditLog.findFirst({
      where: {
        entity_type: "InvitationToken",
        entity_id: created2.body.invitation.id as string,
        action: "invitation.revoked",
      },
    });
    expect(revokedEvent).not.toBeNull();
  });

  it("records password reset request and completion", async () => {
    const fixture = await createTestUser(app, { role: "TEAM_MEMBER" });
    const prisma = app.get(PrismaService);

    await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/request")
      .send({ email: fixture.email });
    const requestedEvent = await prisma.auditLog.findFirst({
      where: { actor_id: fixture.id, action: "auth.password_reset_requested" },
    });
    expect(requestedEvent).not.toBeNull();

    const { SessionService } = await import("../src/modules/auth/services/session.service");
    const token = app.get(SessionService).signPasswordResetToken(fixture.id);
    await request(app.getHttpServer())
      .post("/api/v1/auth/password-reset/confirm")
      .send({ token, password: "audit-reset-password-123" });

    const completedEvent = await prisma.auditLog.findFirst({
      where: { actor_id: fixture.id, action: "auth.password_reset_completed" },
    });
    expect(completedEvent).not.toBeNull();
  });

  /**
   * Document 6 §17 / Document 4's own verification command: `SET ROLE
   * forge_app; UPDATE/DELETE audit_logs → permission denied`. Run for
   * real, at the database-grant level — connecting as the actual
   * application role, not merely trusting that no code path calls
   * `.update()`/`.delete()` on this table (Postgres, not application
   * discipline, is the real enforcement per Document 6 §17).
   *
   * `SET ROLE` + the mutation attempt run inside one `$transaction` so
   * both statements are guaranteed to execute on the same physical
   * connection — outside a transaction, Prisma's connection pool could
   * route them to different connections, silently defeating the
   * session-scoped `SET ROLE`.
   */
  it("AuditLog cannot be UPDATEd or DELETEd by the application's forge_app role", async () => {
    const prisma = app.get(PrismaService);
    const existing = await prisma.auditLog.findFirstOrThrow();

    // Assert specifically on Postgres's permission-denied error (SQLSTATE
    // 42501), not merely "rejects.toThrow()" — a wrongly-typed parameter
    // would also throw, and that would make this test pass for the wrong
    // reason (a SQL error, not the actual DB-grant enforcement it exists
    // to prove).
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE forge_app");
        await tx.$executeRawUnsafe(
          `UPDATE audit_logs SET action = 'TAMPERED' WHERE id = $1::uuid`,
          existing.id
        );
      })
    ).rejects.toMatchObject({ code: "P2010", meta: expect.objectContaining({ code: "42501" }) });

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE forge_app");
        await tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE id = $1::uuid`, existing.id);
      })
    ).rejects.toMatchObject({ code: "P2010", meta: expect.objectContaining({ code: "42501" }) });

    // Confirm the row is genuinely untouched, not just that the promise rejected.
    const unchanged = await prisma.auditLog.findUniqueOrThrow({ where: { id: existing.id } });
    expect(unchanged.action).toBe(existing.action);
  });

  it("forge_app CAN still INSERT into audit_logs (append-only, not read/write-only)", async () => {
    const prisma = app.get(PrismaService);
    const org = await prisma.organization.findFirstOrThrow();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE forge_app");
        await tx.$executeRawUnsafe(
          `INSERT INTO audit_logs (id, organization_id, actor_type, actor_id, action, entity_type, entity_id, created_at)
           VALUES (gen_random_uuid(), $1::uuid, 'SYSTEM', NULL, 'phase1.audit_grant_smoke_test', 'User', gen_random_uuid(), now())`,
          org.id
        );
      })
    ).resolves.not.toThrow();
  });
});
