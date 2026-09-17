import type { INestApplication } from "@nestjs/common";
import type { UserRole } from "@prisma/client";
import request from "supertest";
import { createTestApp, extractCookie } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";

/**
 * Document 5 §4.3's default role → permission matrix, exercised through
 * real HTTP requests against the one resource this phase actually has:
 * `/invitations` (`users.manage`-equivalent for TEAM scope, `portal.manage`
 * for CLIENT scope — Document 6 §2.3). Every one of the five frozen roles
 * is covered with at least one representative allowed and one denied
 * action, per Step 19.
 */
describe("RBAC (e2e)", () => {
  let app: INestApplication;
  const sessions = new Map<UserRole, { cookie: string; csrf: string }>();

  async function loginAs(role: UserRole): Promise<{ cookie: string; csrf: string }> {
    const cached = sessions.get(role);
    if (cached) return cached;

    const fixture = await createTestUser(app, { role });
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: fixture.email, password: fixture.password });
    const setCookie = response.headers["set-cookie"] as unknown as string[];
    const session = {
      cookie: extractCookie(setCookie, "forge_session")!,
      csrf: extractCookie(setCookie, "forge_csrf")!,
    };
    sessions.set(role, session);
    return session;
  }

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("FOUNDER_ADMIN may create a TEAM invitation (allowed)", async () => {
    const session = await loginAs("FOUNDER_ADMIN");
    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`)
      .set("X-CSRF-Token", session.csrf)
      .send({ scope: "TEAM", email: "phase1-e2e-rbac-team-candidate@forge.local", userRole: "SALES" });

    expect(response.status).toBe(201);
    expect(response.body.token).toBeTruthy();
  });

  it("SALES may NOT create a TEAM invitation (denied)", async () => {
    const session = await loginAs("SALES");
    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`)
      .set("X-CSRF-Token", session.csrf)
      .send({ scope: "TEAM", email: "phase1-e2e-rbac-team-candidate-2@forge.local", userRole: "TEAM_MEMBER" });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN_PERMISSION");
  });

  it("SALES may create a CLIENT invitation (allowed, per Doc 6 §2.3 footnote 7)", async () => {
    const session = await loginAs("SALES");
    const prisma = app.get((await import("../src/database/prisma.service")).PrismaService);
    const org = await prisma.organization.findFirstOrThrow();
    const company = await prisma.company.create({
      data: {
        organization_id: org.id,
        name: "Phase 1 E2E RBAC Test Company",
        billing_state: "Maharashtra",
        billing_address: "Test fixture",
      },
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`)
      .set("X-CSRF-Token", session.csrf)
      .send({ scope: "CLIENT", email: "phase1-e2e-rbac-client-candidate@forge.local", companyId: company.id });

    expect(response.status).toBe(201);

    await prisma.invitationToken.deleteMany({ where: { company_id: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
  });

  it("OPERATIONS, FINANCE, and TEAM_MEMBER may NOT create any invitation (denied)", async () => {
    for (const role of ["OPERATIONS", "FINANCE", "TEAM_MEMBER"] as UserRole[]) {
      const session = await loginAs(role);
      const response = await request(app.getHttpServer())
        .post("/api/v1/invitations")
        .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`)
        .set("X-CSRF-Token", session.csrf)
        .send({ scope: "TEAM", email: `phase1-e2e-rbac-denied-${role}@forge.local`, userRole: "TEAM_MEMBER" });

      expect(response.status).toBe(403);
    }
  });

  it("every authenticated role (regardless of permissions) may read its own session/permissions", async () => {
    for (const role of ["FOUNDER_ADMIN", "OPERATIONS", "FINANCE", "SALES", "TEAM_MEMBER"] as UserRole[]) {
      const session = await loginAs(role);
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/permissions")
        .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`);

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body.permissions)).toBe(true);
    }
  });

  it("FOUNDER_ADMIN's permission list is the full catalog (wildcard)", async () => {
    const session = await loginAs("FOUNDER_ADMIN");
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/permissions")
      .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`);

    expect(response.body.permissions).toEqual(
      expect.arrayContaining(["finance.manage", "forge_fund.approve", "audit.read"])
    );
  });

  it("TEAM_MEMBER's permission list excludes finance and forge_fund entirely", async () => {
    const session = await loginAs("TEAM_MEMBER");
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/permissions")
      .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`);

    expect(response.body.permissions).not.toEqual(expect.arrayContaining(["finance.read"]));
    expect(response.body.permissions).not.toEqual(expect.arrayContaining(["forge_fund.read"]));
  });

  it("SALES's permission list excludes finance.read (Doc 5 §4.3 footnote 4 — deny by default)", async () => {
    const session = await loginAs("SALES");
    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/permissions")
      .set("Cookie", `forge_session=${session.cookie}; forge_csrf=${session.csrf}`);

    expect(response.body.permissions).not.toEqual(expect.arrayContaining(["finance.read"]));
  });
});
