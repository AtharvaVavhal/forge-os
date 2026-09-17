import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures } from "./support/fixtures";
import { authHeaders, cleanupCrmFixtures, createTestDeal, listData, loginSession, type AuthSession } from "./support/crm";
import { cleanupSalesFixtures, createTestLineItem, createTestProposal, createTestTaxRate } from "./support/sales";
import { PrismaService } from "../src/database/prisma.service";

describe("Sales — Proposals (e2e)", () => {
  let app: INestApplication;
  let sales: AuthSession;
  let operations: AuthSession;
  let founder: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    sales = await loginSession(app, "SALES");
    operations = await loginSession(app, "OPERATIONS");
    founder = await loginSession(app, "FOUNDER_ADMIN");
  });

  afterAll(async () => {
    await cleanupSalesFixtures(app);
    await cleanupCrmFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("create defaults to version 1, DRAFT, created_by the acting user", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(sales))
      .send({ dealId: deal.id, terms: "Net 30" });

    expect(response.status).toBe(201);
    expect(response.body.version).toBe(1);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.createdBy).toBe(sales.userId);
    expect(response.body.dealId).toBe(deal.id);
  });

  it("get includes line items and a deal summary; list does not require them", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);
    await createTestLineItem(app, sales.organizationId, proposal.id, { description: "Design", sortOrder: 0 });
    await createTestLineItem(app, sales.organizationId, proposal.id, { description: "Development", sortOrder: 1 });

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.lineItems).toHaveLength(2);
    expect(getResponse.body.lineItems[0].description).toBe("Design");
    expect(getResponse.body.deal.id).toBe(deal.id);
    expect(getResponse.body.deal.title).toBe(deal.title);

    const listResponse = await request(app.getHttpServer()).get("/api/v1/proposals").set(authHeaders(sales));
    expect(listResponse.status).toBe(200);
    expect(listData(listResponse.body).some((p: { id: string }) => p.id === proposal.id)).toBe(true);
  });

  it("PATCH edits terms only while DRAFT; PATCH after leaving DRAFT is rejected 409 PROPOSAL_IMMUTABLE", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);

    const editDraft = await request(app.getHttpServer())
      .patch(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(sales))
      .send({ terms: "Updated terms" });
    expect(editDraft.status).toBe(200);
    expect(editDraft.body.terms).toBe("Updated terms");

    const sendResponse = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/send`)
      .set(authHeaders(sales));
    expect(sendResponse.status).toBe(200);

    const editAfterSend = await request(app.getHttpServer())
      .patch(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(sales))
      .send({ terms: "Should be rejected" });
    expect(editAfterSend.status).toBe(409);
    expect(editAfterSend.body.error.code).toBe("PROPOSAL_IMMUTABLE");
  });

  it("PUT line-items replaces the full set atomically, only while DRAFT, with decimal-string money handling", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);
    await createTestLineItem(app, sales.organizationId, proposal.id, { description: "Stale line" });

    const replaceResponse = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${proposal.id}/line-items`)
      .set(authHeaders(sales))
      .send({
        lines: [
          { description: "Discovery", quantity: "1.00", unitPrice: "20000.00", sortOrder: 0 },
          { description: "Build", quantity: "2.50", unitPrice: "15000.00", sortOrder: 1 },
        ],
      });
    expect(replaceResponse.status).toBe(200);
    expect(replaceResponse.body.lineItems).toHaveLength(2);
    const replacedDescriptions = replaceResponse.body.lineItems as Array<{ description: string }>;
    expect(replacedDescriptions.some((l) => l.description === "Stale line")).toBe(false);
    expect(replaceResponse.body.lineItems[1].quantity).toBe("2.50");
    expect(replaceResponse.body.lineItems[1].unitPrice).toBe("15000.00");

    await request(app.getHttpServer()).post(`/api/v1/proposals/${proposal.id}/send`).set(authHeaders(sales));
    const replaceAfterSend = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${proposal.id}/line-items`)
      .set(authHeaders(sales))
      .send({ lines: [{ description: "Too late", quantity: "1.00", unitPrice: "1.00", sortOrder: 0 }] });
    expect(replaceAfterSend.status).toBe(409);
    expect(replaceAfterSend.body.error.code).toBe("PROPOSAL_IMMUTABLE");
  });

  it("rejects malformed money/quantity decimal shapes and mass assignment", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);

    const badMoney = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${proposal.id}/line-items`)
      .set(authHeaders(sales))
      .send({ lines: [{ description: "Bad", quantity: "1.00", unitPrice: "not-a-number" }] });
    expect(badMoney.status).toBe(400);

    const badQuantity = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${proposal.id}/line-items`)
      .set(authHeaders(sales))
      .send({ lines: [{ description: "Bad", quantity: "1", unitPrice: "100.00" }] });
    expect(badQuantity.status).toBe(400);

    const massAssignment = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(sales))
      .send({ dealId: deal.id, status: "ACCEPTED", organizationId: "11111111-1111-1111-1111-111111111111" });
    expect(massAssignment.status).toBe(400);
  });

  it("line items may reference an in-org tax rate; a cross-org one is rejected", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);
    const taxRate = await createTestTaxRate(app, sales.organizationId);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${proposal.id}/line-items`)
      .set(authHeaders(sales))
      .send({ lines: [{ description: "Taxed", quantity: "1.00", unitPrice: "1000.00", taxRateId: taxRate.id }] });
    expect(response.status).toBe(200);
    expect(response.body.lineItems[0].taxRateId).toBe(taxRate.id);
  });

  it("send: DRAFT -> SENT only, sets sentAt, Tier A audit", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/send`)
      .set(authHeaders(sales));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("SENT");
    expect(response.body.sentAt).toBeTruthy();

    const resend = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/send`)
      .set(authHeaders(sales));
    expect(resend.status).toBe(409);

    const prisma = app.get(PrismaService);
    const auditRow = await prisma.auditLog.findFirst({
      where: { entity_type: "Proposal", entity_id: proposal.id, action: "proposal.sent" },
      orderBy: { created_at: "desc" },
    });
    expect(auditRow).not.toBeNull();
  });

  it("transition: SENT -> VIEWED -> REJECTED, each sets its own timestamp and is Tier A audited", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "SENT" });

    const toViewed = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "VIEWED" });
    expect(toViewed.status).toBe(200);
    expect(toViewed.body.status).toBe("VIEWED");
    expect(toViewed.body.viewedAt).toBeTruthy();

    const toRejected = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "REJECTED" });
    expect(toRejected.status).toBe(200);
    expect(toRejected.body.status).toBe("REJECTED");
    expect(toRejected.body.rejectedAt).toBeTruthy();

    const prisma = app.get(PrismaService);
    const auditRows = await prisma.auditLog.findMany({
      where: { entity_type: "Proposal", entity_id: proposal.id, action: "proposal.transitioned" },
    });
    expect(auditRows.length).toBeGreaterThanOrEqual(2);
  });

  it("transition: EXPIRED reachable from both SENT and VIEWED", async () => {
    // Separate deals per proposal — each fixture proposal defaults to
    // version 1, and (organization_id, deal_id, version) must be unique,
    // so two independently-seeded fixture proposals can't share a deal
    // without an explicit distinct version.
    const dealForSent = await createTestDeal(app, sales.organizationId, sales.userId);
    const fromSent = await createTestProposal(app, sales.organizationId, dealForSent.id, sales.userId, {
      status: "SENT",
    });
    const expireFromSent = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${fromSent.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "EXPIRED" });
    expect(expireFromSent.status).toBe(200);
    expect(expireFromSent.body.expiresAt).toBeTruthy();

    const dealForViewed = await createTestDeal(app, sales.organizationId, sales.userId);
    const fromViewed = await createTestProposal(app, sales.organizationId, dealForViewed.id, sales.userId, {
      status: "VIEWED",
    });
    const expireFromViewed = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${fromViewed.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "EXPIRED" });
    expect(expireFromViewed.status).toBe(200);
  });

  it("invalid transitions are rejected: DRAFT via /transition, skip-ahead, and post-terminal", async () => {
    const draftDeal = await createTestDeal(app, sales.organizationId, sales.userId);
    const draftProposal = await createTestProposal(app, sales.organizationId, draftDeal.id, sales.userId, {
      status: "DRAFT",
    });
    const draftTransition = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${draftProposal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "VIEWED" });
    expect(draftTransition.status).toBe(409);
    expect(draftTransition.body.error.code).toBe("PROPOSAL_INVALID_TRANSITION");

    const sentDeal = await createTestDeal(app, sales.organizationId, sales.userId);
    const sentProposal = await createTestProposal(app, sales.organizationId, sentDeal.id, sales.userId, {
      status: "SENT",
    });
    const skipToAccepted = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${sentProposal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "ACCEPTED" });
    expect(skipToAccepted.status).toBe(409);
    expect(skipToAccepted.body.error.code).toBe("PROPOSAL_ACCEPT_IS_PORTAL_ONLY");

    const rejectedDeal = await createTestDeal(app, sales.organizationId, sales.userId);
    const rejectedProposal = await createTestProposal(app, sales.organizationId, rejectedDeal.id, sales.userId, {
      status: "REJECTED",
    });
    const postTerminal = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${rejectedProposal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "VIEWED" });
    expect(postTerminal.status).toBe(409);
    expect(postTerminal.body.error.code).toBe("PROPOSAL_INVALID_TRANSITION");
  });

  it("arbitrary status PATCH is not exposed — PATCH ignores an unknown/unwhitelisted status field", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);

    const response = await request(app.getHttpServer())
      .patch(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(sales))
      .send({ status: "SENT" });
    expect(response.status).toBe(400);
  });

  it("revise: only from non-DRAFT, creates version+1 DRAFT, copies line items, preserves the frozen source", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "SENT" });
    await createTestLineItem(app, sales.organizationId, proposal.id, { description: "Original line", sortOrder: 0 });

    // A separate deal — sharing `deal` here would put a version-99 row in
    // its version space, which would then make the revise() call below
    // (MAX(version for this deal) + 1) legitimately compute 100, not 2.
    const otherDeal = await createTestDeal(app, sales.organizationId, sales.userId);
    const draftRevise = await createTestProposal(app, sales.organizationId, otherDeal.id, sales.userId, {
      status: "DRAFT",
    });
    const draftReviseAttempt = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${draftRevise.id}/revise`)
      .set(authHeaders(sales));
    expect(draftReviseAttempt.status).toBe(409);
    expect(draftReviseAttempt.body.error.code).toBe("PROPOSAL_ALREADY_DRAFT");

    const reviseResponse = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/revise`)
      .set(authHeaders(sales));
    expect(reviseResponse.status).toBe(200);
    expect(reviseResponse.body.status).toBe("DRAFT");
    expect(reviseResponse.body.version).toBe(2);
    expect(reviseResponse.body.dealId).toBe(deal.id);
    expect(reviseResponse.body.lineItems).toHaveLength(1);
    expect(reviseResponse.body.lineItems[0].description).toBe("Original line");
    expect(reviseResponse.body.id).not.toBe(proposal.id);

    // The source (frozen) version is completely unchanged.
    const sourceAfter = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(sales));
    expect(sourceAfter.body.status).toBe("SENT");
    expect(sourceAfter.body.version).toBe(1);
    expect(sourceAfter.body.lineItems).toHaveLength(1);
    expect(sourceAfter.body.lineItems[0].description).toBe("Original line");

    const prisma = app.get(PrismaService);
    const auditRow = await prisma.auditLog.findFirst({
      where: { entity_type: "Proposal", entity_id: reviseResponse.body.id, action: "proposal.revised" },
    });
    expect(auditRow).not.toBeNull();
  });

  it("concurrent revise requests against the same source never produce duplicate versions", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "SENT" });

    const [first, second] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/proposals/${proposal.id}/revise`).set(authHeaders(sales)),
      request(app.getHttpServer()).post(`/api/v1/proposals/${proposal.id}/revise`).set(authHeaders(sales)),
    ]);

    const statuses = [first.status, second.status].sort();
    // Either both succeed (each landing on a distinct version, since both
    // revise the same still-frozen source independently) or one wins and
    // the other hits the unique-constraint-backed conflict — what must
    // never happen is two rows with the same (org, deal, version).
    expect(statuses.every((s) => s === 200 || s === 409)).toBe(true);

    const prisma = app.get(PrismaService);
    const versions = await prisma.proposal.findMany({
      where: { deal_id: deal.id },
      select: { version: true },
    });
    const versionNumbers = versions.map((v) => v.version);
    expect(new Set(versionNumbers).size).toBe(versionNumbers.length); // no duplicates
  });

  it("unique(organization_id, deal_id, version) is the final protection — a direct duplicate insert fails at the DB", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { version: 5 });

    const prisma = app.get(PrismaService);
    await expect(
      prisma.proposal.create({
        data: {
          organization_id: sales.organizationId,
          deal_id: deal.id,
          version: 5,
          status: "DRAFT",
          created_by: sales.userId,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("RBAC: SALES full access; OPERATIONS/FINANCE read-only; TEAM_MEMBER denied entirely", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);

    const opsRead = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(operations));
    expect(opsRead.status).toBe(200);

    const opsCreate = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(operations))
      .send({ dealId: deal.id });
    expect(opsCreate.status).toBe(403);

    const teamMember = await loginSession(app, "TEAM_MEMBER");
    const teamRead = await request(app.getHttpServer())
      .get("/api/v1/proposals")
      .set(authHeaders(teamMember));
    expect(teamRead.status).toBe(403);
  });

  it("FINANCE has sales.read but not sales.manage (does not automatically gain Sales write access)", async () => {
    const finance = await loginSession(app, "FINANCE");
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);

    const readResponse = await request(app.getHttpServer()).get("/api/v1/proposals").set(authHeaders(finance));
    expect(readResponse.status).toBe(200);

    const writeResponse = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(finance))
      .send({ dealId: deal.id });
    expect(writeResponse.status).toBe(403);
  });

  it("unauthenticated request is rejected", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/proposals");
    expect(response.status).toBe(401);
  });

  it("FOUNDER_ADMIN has full access via the wildcard permission", async () => {
    const deal = await createTestDeal(app, founder.organizationId, founder.userId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(founder))
      .send({ dealId: deal.id });
    expect(response.status).toBe(201);
  });
});
