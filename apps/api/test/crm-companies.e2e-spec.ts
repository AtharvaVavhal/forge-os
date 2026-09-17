import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, cleanupTestFixtures } from "./support/fixtures";
import {
  authHeaders,
  cleanupCrmFixtures,
  createTestCompany,
  loginSession,
  CRM_TEST_PREFIX,
  type AuthSession,
  listData,
} from "./support/crm";

describe("CRM — Companies (e2e)", () => {
  let app: INestApplication;
  let sales: AuthSession;
  let founder: AuthSession;
  let operations: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    sales = await loginSession(app, "SALES");
    founder = await loginSession(app, "FOUNDER_ADMIN");
    operations = await loginSession(app, "OPERATIONS");
  });

  afterAll(async () => {
    await cleanupCrmFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("SALES can create a company", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}Acme Corp`, tags: ["priority"] });

    expect(response.status).toBe(201);
    expect(response.body.name).toBe(`${CRM_TEST_PREFIX}Acme Corp`);
    expect(response.body.organizationId ?? response.body.organization_id).toBeTruthy();
  });

  it("OPERATIONS can read but not create a company (crm.read yes, crm.manage no)", async () => {
    const readResponse = await request(app.getHttpServer()).get("/api/v1/companies").set(authHeaders(operations));
    expect(readResponse.status).toBe(200);

    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set(authHeaders(operations))
      .send({ name: `${CRM_TEST_PREFIX}Should Not Be Created` });
    expect(createResponse.status).toBe(403);
    expect(createResponse.body.error.code).toBe("FORBIDDEN_PERMISSION");
  });

  it("unauthenticated request is rejected", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/companies");
    expect(response.status).toBe(401);
  });

  it("get/update/archive round trip", async () => {
    const company = await createTestCompany(app, sales.organizationId);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/companies/${company.id}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.id).toBe(company.id);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/companies/${company.id}`)
      .set(authHeaders(sales))
      .send({ tags: ["renewed"] });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.tags).toEqual(["renewed"]);

    const archiveResponse = await request(app.getHttpServer())
      .post(`/api/v1/companies/${company.id}/archive`)
      .set(authHeaders(sales));
    expect(archiveResponse.status).toBe(200);
    expect(archiveResponse.body.archivedAt ?? archiveResponse.body.archived_at).toBeTruthy();

    // Archived companies are excluded from the default list...
    const listDefault = await request(app.getHttpServer()).get("/api/v1/companies").set(authHeaders(sales));
    expect(listData(listDefault.body).some((c: { id: string }) => c.id === company.id)).toBe(false);

    // ...but included when explicitly requested, and always visible on direct GET.
    const listArchived = await request(app.getHttpServer())
      .get("/api/v1/companies?archived=true")
      .set(authHeaders(sales));
    expect(listData(listArchived.body).some((c: { id: string }) => c.id === company.id)).toBe(true);

    const getArchived = await request(app.getHttpServer())
      .get(`/api/v1/companies/${company.id}`)
      .set(authHeaders(sales));
    expect(getArchived.status).toBe(200);

    // Archiving twice is rejected, not silently accepted.
    const reArchive = await request(app.getHttpServer())
      .post(`/api/v1/companies/${company.id}/archive`)
      .set(authHeaders(sales));
    expect(reArchive.status).toBe(409);
  });

  it("malformed UUID is rejected with 400, not 500", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/companies/not-a-uuid")
      .set(authHeaders(sales));
    expect(response.status).toBe(400);
  });

  it("mass assignment: an unknown field is rejected (fail-closed DTO whitelist)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/companies")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}Whitelist Test`, organizationId: "11111111-1111-1111-1111-111111111111" });
    expect(response.status).toBe(400);
  });

  it("cross-organization isolation: a company in another org is invisible (404, no existence leak)", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const otherCompany = await createTestCompany(app, otherOrgId, { name: `${CRM_TEST_PREFIX}Other Org Co` });

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/companies/${otherCompany.id}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(404);

    const listResponse = await request(app.getHttpServer()).get("/api/v1/companies").set(authHeaders(sales));
    expect(listData(listResponse.body).some((c: { id: string }) => c.id === otherCompany.id)).toBe(false);
  });

  it("q filter matches company name", async () => {
    const unique = `${CRM_TEST_PREFIX}Zephyr-${Date.now()}`;
    await createTestCompany(app, sales.organizationId, { name: unique });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/companies?q=${encodeURIComponent("Zephyr")}`)
      .set(authHeaders(sales));
    expect(response.status).toBe(200);
    expect(listData<{ name: string }>(response.body).some((c) => c.name === unique)).toBe(true);
  });

  it("audit: archiving a company does not silently fail (Tier C — no audit event required, but response must succeed)", async () => {
    const company = await createTestCompany(app, founder.organizationId);
    const response = await request(app.getHttpServer())
      .post(`/api/v1/companies/${company.id}/archive`)
      .set(authHeaders(founder));
    expect(response.status).toBe(200);
  });
});
