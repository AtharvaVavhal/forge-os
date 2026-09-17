import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, cleanupTestFixtures } from "./support/fixtures";
import {
  authHeaders,
  cleanupCrmFixtures,
  createTestCompany,
  createTestContact,
  loginSession,
  CRM_TEST_PREFIX,
  type AuthSession,
  listData,
} from "./support/crm";

describe("CRM — Contacts (e2e)", () => {
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

  it("create / read / update / archive round trip, with a company relation", async () => {
    const company = await createTestCompany(app, sales.organizationId);

    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}Jane Doe`, email: `${CRM_TEST_PREFIX}jane@example.com`, companyId: company.id });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.companyId).toBe(company.id);

    const contactId = createResponse.body.id as string;

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contactId}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(200);

    const listByCompany = await request(app.getHttpServer())
      .get(`/api/v1/contacts?companyId=${company.id}`)
      .set(authHeaders(sales));
    expect(listData(listByCompany.body).some((c: { id: string }) => c.id === contactId)).toBe(true);

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/contacts/${contactId}`)
      .set(authHeaders(sales))
      .send({ phone: "+91-9999999999" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.phone).toBe("+91-9999999999");

    const archiveResponse = await request(app.getHttpServer())
      .post(`/api/v1/contacts/${contactId}/archive`)
      .set(authHeaders(sales));
    expect(archiveResponse.status).toBe(200);
  });

  it("duplicate email within the same (org, company) is rejected with 409 CONTACT_EMAIL_EXISTS", async () => {
    const company = await createTestCompany(app, sales.organizationId);
    const email = `${CRM_TEST_PREFIX}dup-${Date.now()}@example.com`;

    const first = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}First`, email, companyId: company.id });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}Second`, email, companyId: company.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe("CONTACT_EMAIL_EXISTS");
  });

  it("the same email is allowed again under a DIFFERENT company (uniqueness is org+company scoped)", async () => {
    const companyA = await createTestCompany(app, sales.organizationId);
    const companyB = await createTestCompany(app, sales.organizationId);
    const email = `${CRM_TEST_PREFIX}shared-${Date.now()}@example.com`;

    const first = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}A`, email, companyId: companyA.id });
    expect(first.status).toBe(201);

    const second = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}B`, email, companyId: companyB.id });
    expect(second.status).toBe(201);
  });

  it("RBAC: TEAM_MEMBER's crm.read is currently scoped to nothing (Companies/Contacts fail-closed until B4 Projects exists)", async () => {
    const contact = await createTestContact(app, teamMember.organizationId, { name: `${CRM_TEST_PREFIX}Hidden From Team` });

    const listResponse = await request(app.getHttpServer()).get("/api/v1/contacts").set(authHeaders(teamMember));
    expect(listResponse.status).toBe(200);
    expect(listData(listResponse.body).some((c: { id: string }) => c.id === contact.id)).toBe(false);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${contact.id}`)
      .set(authHeaders(teamMember));
    expect(getResponse.status).toBe(403);
  });

  it("cross-organization isolation: cannot link a contact to another org's company (nested-relation IDOR)", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const otherCompany = await createTestCompany(app, otherOrgId);

    const response = await request(app.getHttpServer())
      .post("/api/v1/contacts")
      .set(authHeaders(sales))
      .send({ name: `${CRM_TEST_PREFIX}Cross Org Attempt`, companyId: otherCompany.id });

    expect(response.status).toBe(404);
  });

  it("cross-organization isolation: a contact in another org is invisible by id", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const otherContact = await createTestContact(app, otherOrgId, { name: `${CRM_TEST_PREFIX}Other Org Contact` });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/contacts/${otherContact.id}`)
      .set(authHeaders(sales));
    expect(response.status).toBe(404);
  });
});
