import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import {
  cleanupTestFixtures,
  createSecondOrganization,
  createTestUser,
} from "./support/fixtures";

/**
 * Step 10/19/20 — cross-organization isolation and IDOR resistance.
 *
 * Phase 1 has no organization-scoped *business* resource yet (no Company/
 * Deal/etc. endpoint exists — those are later phases), so this cannot
 * fully exercise "list scoped by org" the way a future CRM endpoint will.
 * What genuinely exists to test in this phase is the identity/session
 * layer's own cross-org integrity: `OrganizationContextService`'s
 * org-scoped lookup (used by login, exercised implicitly throughout this
 * suite), and — the meaningful, security-relevant case here — that
 * `JwtAuthGuard` rejects a token whose `org` claim doesn't match the
 * organization the named user actually belongs to, rather than trusting
 * the claim. This is documented explicitly as a scope boundary, not
 * silently presented as full CRUD-level cross-org testing.
 */
describe("Organization isolation (e2e)", () => {
  let app: INestApplication;
  let secondOrgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    secondOrgId = await createSecondOrganization(app);
  });

  afterAll(async () => {
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("organization-scoped login lookup resolves the primary org, not the newer second org (correctness, not just isolation)", async () => {
    // `OrganizationContextService.resolveSingleOrganizationId()` picks the
    // *oldest* organization (Document 2 §D's single seeded org). With a
    // second, newer organization now present, a login attempt for a user
    // that exists ONLY in the primary org must still succeed — proving
    // the resolver isn't accidentally picking the second (most-recently-
    // created) org instead.
    const { OrganizationContextService } = await import(
      "../src/modules/shared/organization-context.service"
    );
    const resolvedOrgId = await app
      .get(OrganizationContextService)
      .resolveSingleOrganizationId();

    expect(resolvedOrgId).not.toBe(secondOrgId);

    const primaryOrgFixture = await createTestUser(app, { role: "FOUNDER_ADMIN" });
    expect(primaryOrgFixture.organizationId).toBe(resolvedOrgId);

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: primaryOrgFixture.email, password: primaryOrgFixture.password });

    expect(response.status).toBe(200);
    expect(response.body.organizationId).toBe(resolvedOrgId);
  });

  it("a user who exists ONLY in the second organization cannot log in at all (single-org login scope, V1)", async () => {
    // The direct consequence of the resolver above always picking the
    // primary org: a user real in every other sense, but who belongs to
    // a *different* organization than the one login resolves against,
    // gets the identical generic failure as a nonexistent user — not a
    // distinguishing "wrong organization" error (which would itself leak
    // information). This is correct, intentional V1 behavior, not a gap.
    const secondOrgFixture = await createTestUser(app, {
      role: "FOUNDER_ADMIN",
      organizationId: secondOrgId,
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: secondOrgFixture.email, password: secondOrgFixture.password });

    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid email or password.");
  });

  it("rejects a token whose org claim doesn't match the named user's real organization (forged/stale claim)", async () => {
    const primaryOrgUser = await createTestUser(app, { role: "TEAM_MEMBER" });

    const { JwtService } = await import("@nestjs/jwt");
    const { ConfigService } = await import("@nestjs/config");
    const config = app.get(ConfigService);
    const jwt = new JwtService({});
    const forgedToken = jwt.sign(
      {
        sub: primaryOrgUser.id, // a real user...
        org: secondOrgId, // ...but claiming the WRONG organization
        role: "FOUNDER_ADMIN", // ...and an escalated role
        aud: "internal",
      },
      { secret: config.get("auth.sessionJwtSigningKey"), expiresIn: "1h" }
    );

    const response = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `forge_session=${forgedToken}`);

    expect(response.status).toBe(401);
  });

  it("privilege escalation: a forged token claiming an elevated role for a real, correctly-scoped user is not honored (role is re-derived from the live row, not trusted from the token)", async () => {
    const teamMember = await createTestUser(app, { role: "TEAM_MEMBER" });

    const { JwtService } = await import("@nestjs/jwt");
    const { ConfigService } = await import("@nestjs/config");
    const config = app.get(ConfigService);
    const jwt = new JwtService({});
    const forgedToken = jwt.sign(
      {
        sub: teamMember.id, // a real user, correct org...
        org: teamMember.organizationId,
        role: "FOUNDER_ADMIN", // ...but claiming a role this user does not have
        aud: "internal",
      },
      { secret: config.get("auth.sessionJwtSigningKey"), expiresIn: "1h" }
    );

    // The token is otherwise perfectly valid (correct signature, correct
    // org, real active user) — only the role claim is forged. If the
    // guard trusted it, this would succeed at a FOUNDER_ADMIN-only action.
    const response = await request(app.getHttpServer())
      .post("/api/v1/invitations")
      .set("Cookie", `forge_session=${forgedToken}`)
      .set("X-CSRF-Token", "irrelevant") // no real CSRF cookie was issued for
      // this forged token, so this request should fail on CSRF *or*
      // permissions — either way, TEAM_MEMBER must never succeed here.
      .send({ scope: "TEAM", email: "escalation-attempt@forge.local", userRole: "FOUNDER_ADMIN" });

    expect([403]).toContain(response.status);
    expect(["FORBIDDEN_PERMISSION", "CSRF_TOKEN_INVALID"]).toContain(response.body.error.code);

    // Prove it precisely via a read-only endpoint with no CSRF requirement
    // (GET is a safe method): /auth/me must report the user's REAL role,
    // not the forged claim.
    const me = await request(app.getHttpServer())
      .get("/api/v1/auth/me")
      .set("Cookie", `forge_session=${forgedToken}`);
    expect(me.status).toBe(200);
    expect(me.body.role).toBe("TEAM_MEMBER");
  });

  it("cross-org ID enumeration: a login attempt against another org's email in a different org context yields the same generic failure", async () => {
    // Two users with DIFFERENT emails in different orgs — confirms the
    // organization-scoped lookup (`{organization_id, email}`, not a bare
    // global email lookup) doesn't accidentally let one org's login
    // attempt resolve into another org's account.
    const secondOrgFixture = await createTestUser(app, {
      role: "TEAM_MEMBER",
      organizationId: secondOrgId,
    });

    // The primary (seeded) organization has no user with this exact email
    // — logging in "as" it from the primary org's context must fail
    // exactly like any other unknown-email attempt, not succeed by
    // accidentally matching the second org's row.
    const response = await request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({ email: secondOrgFixture.email, password: secondOrgFixture.password });

    // This *should* fail only if login is correctly scoped to a single
    // resolved organization (the seeded primary one) and does not search
    // across all organizations for a matching email.
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe("Invalid email or password.");
  });
});
