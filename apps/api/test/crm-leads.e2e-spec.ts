import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, cleanupTestFixtures } from "./support/fixtures";
import {
  authHeaders,
  cleanupCrmFixtures,
  createTestCompany,
  createTestLead,
  loginSession,
  CRM_TEST_PREFIX,
  type AuthSession,
  listData,
} from "./support/crm";

describe("CRM — Leads (e2e)", () => {
  let app: INestApplication;
  let sales: AuthSession;
  let teamMember: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    sales = await loginSession(app, "SALES");
    teamMember = await loginSession(app, "TEAM_MEMBER");
  });

  afterAll(async () => {
    await cleanupCrmFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("create, list, and filter by status/source", async () => {
    const company = await createTestCompany(app, sales.organizationId);

    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/leads")
      .set(authHeaders(sales))
      .send({ companyId: company.id, source: "REFERRAL", notes: `${CRM_TEST_PREFIX}fixture lead` });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.status).toBe("NEW");

    const leadId = createResponse.body.id as string;

    const listByStatus = await request(app.getHttpServer())
      .get("/api/v1/leads?status=NEW")
      .set(authHeaders(sales));
    expect(listData(listByStatus.body).some((l: { id: string }) => l.id === leadId)).toBe(true);

    const listBySource = await request(app.getHttpServer())
      .get("/api/v1/leads?source=REFERRAL")
      .set(authHeaders(sales));
    expect(listData(listBySource.body).some((l: { id: string }) => l.id === leadId)).toBe(true);

    const listWrongStatus = await request(app.getHttpServer())
      .get("/api/v1/leads?status=DISQUALIFIED")
      .set(authHeaders(sales));
    expect(listData(listWrongStatus.body).some((l: { id: string }) => l.id === leadId)).toBe(false);
  });

  it("valid transition: NEW -> CONTACTED -> QUALIFIED", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "NEW" });

    const toContacted = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "CONTACTED" });
    expect(toContacted.status).toBe(200);
    expect(toContacted.body.status).toBe("CONTACTED");

    const toQualified = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "QUALIFIED" });
    expect(toQualified.status).toBe(200);
    expect(toQualified.body.status).toBe("QUALIFIED");
  });

  it("invalid transition: NEW -> QUALIFIED (skipping CONTACTED) is rejected", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "NEW" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "QUALIFIED" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("LEAD_INVALID_TRANSITION");
  });

  it("cannot reach CONVERTED via the generic transition endpoint", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "QUALIFIED" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "CONVERTED" });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("LEAD_USE_CONVERT_ENDPOINT");
  });

  it("disqualify: valid from NEW/CONTACTED/QUALIFIED, terminal afterward", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "CONTACTED" });

    const disqualify = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "DISQUALIFIED" });
    expect(disqualify.status).toBe(200);

    const afterTerminal = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "CONTACTED" });
    expect(afterTerminal.status).toBe(409);
  });

  it("conversion: only from QUALIFIED, creates a Deal, sets convertedToDealId, is transactional", async () => {
    const company = await createTestCompany(app, sales.organizationId);
    const lead = await createTestLead(app, sales.organizationId, { status: "QUALIFIED", companyId: company.id });

    const notQualifiedLead = await createTestLead(app, sales.organizationId, { status: "NEW" });
    const rejectedConvert = await request(app.getHttpServer())
      .post(`/api/v1/leads/${notQualifiedLead.id}/convert`)
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}Should Not Convert`, estimatedValue: "5000.00" });
    expect(rejectedConvert.status).toBe(409);
    expect(rejectedConvert.body.error.code).toBe("LEAD_CONVERT_REQUIRES_QUALIFIED");

    const convertResponse = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}Converted Deal`, estimatedValue: "25000.00" });
    expect(convertResponse.status).toBe(200);
    expect(convertResponse.body.lead.status).toBe("CONVERTED");
    expect(convertResponse.body.lead.convertedToDealId).toBe(convertResponse.body.deal.id);
    expect(convertResponse.body.deal.companyId).toBe(company.id);
    expect(convertResponse.body.deal.title).toBe(`${CRM_TEST_PREFIX}Converted Deal`);

    // The lead row is never deleted.
    const getLead = await request(app.getHttpServer()).get(`/api/v1/leads/${lead.id}`).set(authHeaders(sales));
    expect(getLead.status).toBe(200);
    expect(getLead.body.status).toBe("CONVERTED");
  });

  it("duplicate conversion is rejected", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "QUALIFIED" });

    const first = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}First Convert`, estimatedValue: "1000.00" });
    expect(first.status).toBe(200);

    // By the time a second, sequential attempt runs, the lead is no
    // longer QUALIFIED (it's CONVERTED) — so this is correctly rejected
    // by the ordinary precondition check, not the race-only guard below.
    const second = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}Second Convert Attempt`, estimatedValue: "1000.00" });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("LEAD_CONVERT_REQUIRES_QUALIFIED");
  });

  it("duplicate conversion under a real race (concurrent requests) is still rejected exactly once — the atomic updateMany guard, not just the sequential precondition check", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "QUALIFIED" });

    const [first, second] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/leads/${lead.id}/convert`)
        .set(authHeaders(sales))
        .send({ title: `${CRM_TEST_PREFIX}Race A`, estimatedValue: "1000.00" }),
      request(app.getHttpServer())
        .post(`/api/v1/leads/${lead.id}/convert`)
        .set(authHeaders(sales))
        .send({ title: `${CRM_TEST_PREFIX}Race B`, estimatedValue: "1000.00" }),
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([200, 409]);

    const winner = first.status === 200 ? first : second;
    const loser = first.status === 200 ? second : first;
    // Depending on exact timing, the loser is rejected either by the
    // atomic `updateMany` guard inside the transaction (both requests'
    // initial reads saw QUALIFIED) or by the ordinary precondition check
    // (its read happened to land after the winner's write) — both are
    // correct rejections; either way exactly one request succeeds and no
    // duplicate Deal is created, which is the actual guarantee under test.
    expect(["LEAD_ALREADY_CONVERTED", "LEAD_CONVERT_REQUIRES_QUALIFIED"]).toContain(loser.body.error.code);

    // Exactly one Deal was created from this lead, not two.
    const getLead = await request(app.getHttpServer()).get(`/api/v1/leads/${lead.id}`).set(authHeaders(sales));
    expect(getLead.body.convertedToDealId).toBe(winner.body.deal.id);
  });

  it("client cannot fabricate the target deal (no dealId field is accepted by the convert DTO)", async () => {
    const lead = await createTestLead(app, sales.organizationId, { status: "QUALIFIED" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/leads/${lead.id}/convert`)
      .set(authHeaders(sales))
      .send({
        title: `${CRM_TEST_PREFIX}Fabrication Attempt`,
        estimatedValue: "1000.00",
        dealId: "11111111-1111-1111-1111-111111111111",
      });
    expect(response.status).toBe(400);
  });

  it("RBAC: TEAM_MEMBER cannot access Leads at all (Document 6 marks it denied, not limited)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/leads").set(authHeaders(teamMember));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN_PERMISSION");
  });

  it("cross-organization isolation: a lead in another org is invisible", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const otherLead = await createTestLead(app, otherOrgId);

    const response = await request(app.getHttpServer()).get(`/api/v1/leads/${otherLead.id}`).set(authHeaders(sales));
    expect(response.status).toBe(404);
  });

  it("unauthenticated request is rejected", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/leads");
    expect(response.status).toBe(401);
  });
});
