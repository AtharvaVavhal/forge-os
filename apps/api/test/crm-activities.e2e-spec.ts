import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, cleanupTestFixtures } from "./support/fixtures";
import {
  authHeaders,
  cleanupCrmFixtures,
  createTestCompany,
  createTestDeal,
  loginSession,
  CRM_TEST_PREFIX,
  type AuthSession,
  listData,
} from "./support/crm";

describe("CRM — Activities (e2e)", () => {
  let app: INestApplication;
  let sales: AuthSession;
  let operations: AuthSession;
  let teamMember: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    sales = await loginSession(app, "SALES");
    operations = await loginSession(app, "OPERATIONS");
    teamMember = await loginSession(app, "TEAM_MEMBER");
  });

  afterAll(async () => {
    await cleanupCrmFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("create against a Company parent, then list scoped to that company", async () => {
    const company = await createTestCompany(app, sales.organizationId);

    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({ companyId: company.id, type: "call", summary: `${CRM_TEST_PREFIX}Called the client` });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.companyId).toBe(company.id);

    const listResponse = await request(app.getHttpServer())
      .get(`/api/v1/activities?companyId=${company.id}`)
      .set(authHeaders(sales));
    expect(listResponse.status).toBe(200);
    expect(listData(listResponse.body).some((a: { id: string }) => a.id === createResponse.body.id)).toBe(true);
  });

  it("OPERATIONS and FINANCE may create activities even without crm.manage (Document 6 §2.3 broader creator set)", async () => {
    const company = await createTestCompany(app, operations.organizationId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(operations))
      .send({ companyId: company.id, type: "note", summary: `${CRM_TEST_PREFIX}Operations logged an activity` });
    expect(response.status).toBe(201);
  });

  it("rejects more than one parent, and rejects zero parents", async () => {
    const company = await createTestCompany(app, sales.organizationId);
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);

    const twoParents = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({ companyId: company.id, dealId: deal.id, type: "call", summary: `${CRM_TEST_PREFIX}Two parents` });
    expect(twoParents.status).toBe(400);
    expect(twoParents.body.error.code).toBe("ACTIVITY_REQUIRES_EXACTLY_ONE_PARENT");

    const zeroParents = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({ type: "call", summary: `${CRM_TEST_PREFIX}No parent` });
    expect(zeroParents.status).toBe(400);
    expect(zeroParents.body.error.code).toBe("ACTIVITY_REQUIRES_EXACTLY_ONE_PARENT");
  });

  it("rejects an undocumented parent type (projectId — Projects/B4 is not implemented)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({
        projectId: "11111111-1111-1111-1111-111111111111",
        type: "call",
        summary: `${CRM_TEST_PREFIX}Project parent attempt`,
      });
    expect(response.status).toBe(400);
  });

  it("nextFollowUpAt is only valid when the parent is a Deal, and updates the Deal as a side effect", async () => {
    const company = await createTestCompany(app, sales.organizationId);
    const rejectedFollowUp = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({
        companyId: company.id,
        type: "call",
        summary: `${CRM_TEST_PREFIX}Follow-up on non-deal parent`,
        nextFollowUpAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(rejectedFollowUp.status).toBe(400);
    expect(rejectedFollowUp.body.error.code).toBe("ACTIVITY_FOLLOW_UP_REQUIRES_DEAL");

    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const followUpAt = new Date(Date.now() + 86_400_000).toISOString();
    const acceptedFollowUp = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({ dealId: deal.id, type: "call", summary: `${CRM_TEST_PREFIX}Follow-up on deal`, nextFollowUpAt: followUpAt });
    expect(acceptedFollowUp.status).toBe(201);

    const getDeal = await request(app.getHttpServer()).get(`/api/v1/deals/${deal.id}`).set(authHeaders(sales));
    expect(new Date(getDeal.body.nextFollowUpAt as string).toISOString()).toBe(followUpAt);
  });

  it("RBAC: TEAM_MEMBER's create is denied (fail-closed, matching its empty assigned-scope)", async () => {
    const company = await createTestCompany(app, teamMember.organizationId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(teamMember))
      .send({ companyId: company.id, type: "call", summary: `${CRM_TEST_PREFIX}Team member attempt` });
    expect(response.status).toBe(403);
  });

  it("cross-organization isolation: cannot attach an activity to another org's deal (nested-relation IDOR)", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const { createTestUser } = await import("./support/fixtures");
    const otherOwner = await createTestUser(app, { role: "FOUNDER_ADMIN", organizationId: otherOrgId });
    const otherDeal = await createTestDeal(app, otherOrgId, otherOwner.id);

    const response = await request(app.getHttpServer())
      .post("/api/v1/activities")
      .set(authHeaders(sales))
      .send({ dealId: otherDeal.id, type: "call", summary: `${CRM_TEST_PREFIX}Cross org attempt` });
    expect(response.status).toBe(404);
  });

  it("unauthenticated request is rejected", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/activities");
    expect(response.status).toBe(401);
  });
});
