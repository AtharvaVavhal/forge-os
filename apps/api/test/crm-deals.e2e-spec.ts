import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, createTestUser, cleanupTestFixtures } from "./support/fixtures";
import {
  authHeaders,
  cleanupCrmFixtures,
  createAcceptedProposal,
  createTestDeal,
  loginSession,
  CRM_TEST_PREFIX,
  type AuthSession,
  listData,
} from "./support/crm";

describe("CRM — Deals (e2e)", () => {
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

  it("create defaults to NEW stage and the acting user as owner", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/deals")
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}New Deal`, estimatedValue: "15000.00" });

    expect(response.status).toBe(201);
    expect(response.body.stage).toBe("NEW");
    expect(response.body.ownerId).toBe(sales.userId);
  });

  it("rejects a malformed money value (float / wrong decimal places)", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/deals")
      .set(authHeaders(sales))
      .send({ title: `${CRM_TEST_PREFIX}Bad Money`, estimatedValue: "15000" });
    expect(response.status).toBe(400);
  });

  it("list/filter by stage and ownerId", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "QUALIFIED" });

    const byStage = await request(app.getHttpServer()).get("/api/v1/deals?stage=QUALIFIED").set(authHeaders(sales));
    expect(listData(byStage.body).some((d: { id: string }) => d.id === deal.id)).toBe(true);

    const byOwner = await request(app.getHttpServer())
      .get(`/api/v1/deals?ownerId=${sales.userId}`)
      .set(authHeaders(sales));
    expect(listData(byOwner.body).some((d: { id: string }) => d.id === deal.id)).toBe(true);
  });

  it("valid linear transition: NEW -> CONTACTED", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEW" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "CONTACTED" });
    expect(response.status).toBe(200);
    expect(response.body.stage).toBe("CONTACTED");
  });

  it("invalid transition: skipping ahead in the linear path is rejected", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEW" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "DISCOVERY" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DEAL_INVALID_TRANSITION");
  });

  it("LOST requires a reason", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEGOTIATION" });

    const withoutReason = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "LOST" });
    expect(withoutReason.status).toBe(400);
    expect(withoutReason.body.error.code).toBe("DEAL_LOST_REASON_REQUIRED");

    const withReason = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "LOST", lostReason: "PRICE" });
    expect(withReason.status).toBe(200);
    expect(withReason.body.stage).toBe("LOST");
    expect(withReason.body.lostReason).toBe("PRICE");
  });

  it("LOST is allowed directly from an early non-terminal stage (not just the adjacent one)", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEW" });
    const response = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "LOST", lostReason: "GHOSTED" });
    expect(response.status).toBe(200);
  });

  it("WON requires an accepted proposal — fails explicitly with the documented error when none exists (Sales/B3 not implemented yet)", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEGOTIATION" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL");
  });

  it("WON succeeds once an accepted proposal exists for the deal", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEGOTIATION" });
    await createAcceptedProposal(app, sales.organizationId, deal.id, sales.userId);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "WON" });
    expect(response.status).toBe(200);
    expect(response.body.stage).toBe("WON");
  });

  it("WON/LOST are terminal — no further transition is accepted", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "LOST" });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/deals/${deal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "NEGOTIATION" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("DEAL_TERMINAL_STAGE");
  });

  it("reopen: only from a terminal stage, creates a new Deal with reopenedFromDealId set", async () => {
    const activeDeal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEGOTIATION" });
    const notTerminalReopen = await request(app.getHttpServer())
      .post(`/api/v1/deals/${activeDeal.id}/reopen`)
      .set(authHeaders(sales))
      .send({});
    expect(notTerminalReopen.status).toBe(409);

    const lostDeal = await createTestDeal(app, sales.organizationId, sales.userId, {
      stage: "LOST",
      title: `${CRM_TEST_PREFIX}Lost Deal To Reopen`,
    });
    const reopenResponse = await request(app.getHttpServer())
      .post(`/api/v1/deals/${lostDeal.id}/reopen`)
      .set(authHeaders(sales))
      .send({});
    expect(reopenResponse.status).toBe(200);
    expect(reopenResponse.body.reopenedFromDealId).toBe(lostDeal.id);
    expect(reopenResponse.body.stage).toBe("NEW");
    expect(reopenResponse.body.id).not.toBe(lostDeal.id);
  });

  it("PATCH cannot change stage (arbitrary status PATCH is rejected)", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId, { stage: "NEW" });
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/deals/${deal.id}`)
      .set(authHeaders(sales))
      .send({ stage: "WON" });
    expect(response.status).toBe(400);
  });

  it("bulk-reassign changes owner for multiple deals in one call, Tier B audit", async () => {
    const dealA = await createTestDeal(app, sales.organizationId, sales.userId);
    const dealB = await createTestDeal(app, sales.organizationId, sales.userId);
    const newOwner = await loginSession(app, "FOUNDER_ADMIN");

    const response = await request(app.getHttpServer())
      .post("/api/v1/deals/bulk-reassign")
      .set(authHeaders(sales))
      .send({ ids: [dealA.id, dealB.id], ownerId: newOwner.userId });
    expect(response.status).toBe(200);
    expect(response.body.count).toBe(2);

    const getA = await request(app.getHttpServer()).get(`/api/v1/deals/${dealA.id}`).set(authHeaders(sales));
    expect(getA.body.ownerId).toBe(newOwner.userId);
  });

  it("RBAC: TEAM_MEMBER cannot access Deals at all", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/deals").set(authHeaders(teamMember));
    expect(response.status).toBe(403);
  });

  it("cross-organization isolation: a deal in another org is invisible, and cannot be targeted by transition", async () => {
    const otherOrgId = await createSecondOrganization(app);
    // Cannot use `loginSession` here — a user in a *second* org can never
    // log in via /auth/login at all (Phase 1's documented single-org
    // resolver behavior). Only a real User row is needed as the Deal's
    // required `owner_id` FK.
    const otherOwner = await createTestUser(app, { role: "FOUNDER_ADMIN", organizationId: otherOrgId });
    const otherDeal = await createTestDeal(app, otherOrgId, otherOwner.id);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/deals/${otherDeal.id}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(404);

    const transitionResponse = await request(app.getHttpServer())
      .post(`/api/v1/deals/${otherDeal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "CONTACTED" });
    expect(transitionResponse.status).toBe(404);
  });
});
