import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, createTestUser, cleanupTestFixtures } from "./support/fixtures";
import { authHeaders, cleanupCrmFixtures, createTestDeal, loginSession, type AuthSession } from "./support/crm";
import { cleanupSalesFixtures, createTestLineItem, createTestProposal } from "./support/sales";
import { PrismaService } from "../src/database/prisma.service";

/**
 * Task section 14's explicit 20-item red-team list. Items already fully
 * exercised in sales-proposals.e2e-spec.ts (1 unauthenticated access, 2
 * unauthorized role, 9 invalid lifecycle transition, 10 arbitrary status
 * PATCH, 11 immutable proposal mutation, 13 concurrent revision, 19
 * unique(deal_id, version), 20 audit record creation) are not duplicated
 * here — see docs/IMPLEMENTATION-PHASE-B3.md for the full item-by-item
 * mapping. This file covers the remaining items: 3-8, 12, 14-18.
 */
describe("Sales — Proposals security/red-team (e2e)", () => {
  let app: INestApplication;
  let sales: AuthSession;
  let secondOrgId: string;
  let secondOrgSales: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    sales = await loginSession(app, "SALES");
    secondOrgId = await createSecondOrganization(app);
    const secondOrgUser = await createTestUser(app, { role: "SALES", organizationId: secondOrgId });
    secondOrgSales = {
      cookie: "",
      csrf: "",
      userId: secondOrgUser.id,
      email: secondOrgUser.email,
      organizationId: secondOrgId,
    };
  });

  afterAll(async () => {
    await cleanupSalesFixtures(app);
    await cleanupCrmFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("3. cross-org Proposal IDOR: a proposal in another org is invisible (404, no existence leak)", async () => {
    const otherDeal = await createTestDeal(app, secondOrgId, secondOrgSales.userId);
    const otherProposal = await createTestProposal(app, secondOrgId, otherDeal.id, secondOrgSales.userId);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${otherProposal.id}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(404);

    const listResponse = await request(app.getHttpServer()).get("/api/v1/proposals").set(authHeaders(sales));
    const ids = (listResponse.body.data as Array<{ id: string }>).map((p) => p.id);
    expect(ids).not.toContain(otherProposal.id);
  });

  it("4. cross-org Deal IDOR: creating a proposal against another org's deal is rejected 404", async () => {
    const otherDeal = await createTestDeal(app, secondOrgId, secondOrgSales.userId);

    const response = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(sales))
      .send({ dealId: otherDeal.id });
    expect(response.status).toBe(404);
  });

  it("5. cross-org line-item access: line items of another org's proposal are unreachable (whole proposal 404s; PUT line-items also 404s)", async () => {
    const otherDeal = await createTestDeal(app, secondOrgId, secondOrgSales.userId);
    const otherProposal = await createTestProposal(app, secondOrgId, otherDeal.id, secondOrgSales.userId);
    await createTestLineItem(app, secondOrgId, otherProposal.id, { description: "Other org's confidential line" });

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${otherProposal.id}`)
      .set(authHeaders(sales));
    expect(getResponse.status).toBe(404);

    const putResponse = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${otherProposal.id}/line-items`)
      .set(authHeaders(sales))
      .send({ lines: [{ description: "Injected", quantity: "1.00", unitPrice: "1.00" }] });
    expect(putResponse.status).toBe(404);
  });

  it("6. organization_id spoofing: a client-supplied organizationId is rejected outright, never silently substituted", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);

    const createAttempt = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(sales))
      .send({ dealId: deal.id, organizationId: secondOrgId });
    expect(createAttempt.status).toBe(400);

    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);
    const patchAttempt = await request(app.getHttpServer())
      .patch(`/api/v1/proposals/${proposal.id}`)
      .set(authHeaders(sales))
      .send({ terms: "fine", organization_id: secondOrgId });
    expect(patchAttempt.status).toBe(400);
  });

  it("7. mass assignment: unknown/server-owned fields (version, status, createdBy) are rejected on create", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/proposals")
      .set(authHeaders(sales))
      .send({ dealId: deal.id, version: 99, status: "ACCEPTED", createdBy: "11111111-1111-1111-1111-111111111111" });
    expect(response.status).toBe(400);
  });

  it("8. malformed UUID: every :id route rejects a non-UUID path param with 400, not 500", async () => {
    const bad = "not-a-uuid";
    const getR = await request(app.getHttpServer()).get(`/api/v1/proposals/${bad}`).set(authHeaders(sales));
    expect(getR.status).toBe(400);
    const sendR = await request(app.getHttpServer()).post(`/api/v1/proposals/${bad}/send`).set(authHeaders(sales));
    expect(sendR.status).toBe(400);
    const reviseR = await request(app.getHttpServer()).post(`/api/v1/proposals/${bad}/revise`).set(authHeaders(sales));
    expect(reviseR.status).toBe(400);
    const transitionR = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${bad}/transition`)
      .set(authHeaders(sales))
      .send({ to: "VIEWED" });
    expect(transitionR.status).toBe(400);
  });

  it("12. duplicate revision: two sequential (non-concurrent) revises of the same frozen source both succeed with distinct versions, never colliding", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "SENT" });

    const first = await request(app.getHttpServer()).post(`/api/v1/proposals/${proposal.id}/revise`).set(authHeaders(sales));
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);

    const second = await request(app.getHttpServer()).post(`/api/v1/proposals/${proposal.id}/revise`).set(authHeaders(sales));
    expect(second.status).toBe(200);
    expect(second.body.version).toBe(3);
    expect(second.body.id).not.toBe(first.body.id);
  });

  it("14. invalid acceptance: /transition to ACCEPTED is rejected from every reachable source state (DRAFT, SENT, VIEWED)", async () => {
    for (const status of ["DRAFT", "SENT", "VIEWED"] as const) {
      // A fresh deal per iteration — each fixture proposal defaults to
      // version 1, which would otherwise collide on a shared deal.
      const deal = await createTestDeal(app, sales.organizationId, sales.userId);
      const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status });
      const response = await request(app.getHttpServer())
        .post(`/api/v1/proposals/${proposal.id}/transition`)
        .set(authHeaders(sales))
        .send({ to: "ACCEPTED" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PROPOSAL_ACCEPT_IS_PORTAL_ONLY");
    }
  });

  it("15. duplicate/invalid acceptance: an already-ACCEPTED proposal remains fully immutable through every internal endpoint", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const accepted = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "ACCEPTED" });

    const reAccept = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${accepted.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "ACCEPTED" });
    expect(reAccept.status).toBe(409);

    const otherTransition = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${accepted.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "VIEWED" });
    expect(otherTransition.status).toBe(409);
    expect(otherTransition.body.error.code).toBe("PROPOSAL_INVALID_TRANSITION");

    const editAttempt = await request(app.getHttpServer())
      .patch(`/api/v1/proposals/${accepted.id}`)
      .set(authHeaders(sales))
      .send({ terms: "changed" });
    expect(editAttempt.status).toBe(409);
  });

  it("16. unauthorized revision: a role without sales.manage cannot revise", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "SENT" });
    const operations = await loginSession(app, "OPERATIONS");

    const response = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/revise`)
      .set(authHeaders(operations));
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("FORBIDDEN_PERMISSION");
  });

  it("17. unauthorized lifecycle action: a role without sales.manage cannot send or transition", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);
    const teamMember = await loginSession(app, "TEAM_MEMBER");

    const sendResponse = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/send`)
      .set(authHeaders(teamMember));
    expect(sendResponse.status).toBe(403);

    const sentDeal = await createTestDeal(app, sales.organizationId, sales.userId);
    const sentProposal = await createTestProposal(app, sales.organizationId, sentDeal.id, sales.userId, {
      status: "SENT",
    });
    const transitionResponse = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${sentProposal.id}/transition`)
      .set(authHeaders(teamMember))
      .send({ to: "VIEWED" });
    expect(transitionResponse.status).toBe(403);
  });

  it("18. historical version integrity: editing the new draft after revise never mutates the frozen source's snapshotted line items", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const source = await createTestProposal(app, sales.organizationId, deal.id, sales.userId, { status: "SENT" });
    await createTestLineItem(app, sales.organizationId, source.id, { description: "Frozen line", sortOrder: 0 });

    const reviseResponse = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${source.id}/revise`)
      .set(authHeaders(sales));
    expect(reviseResponse.status).toBe(200);
    const newDraftId = reviseResponse.body.id as string;

    // Mutate the NEW draft's line items — a completely independent row set.
    const replaceResponse = await request(app.getHttpServer())
      .put(`/api/v1/proposals/${newDraftId}/line-items`)
      .set(authHeaders(sales))
      .send({ lines: [{ description: "Edited on the new draft only", quantity: "1.00", unitPrice: "1.00" }] });
    expect(replaceResponse.status).toBe(200);

    // The original, frozen source must be completely unaffected.
    const sourceAfter = await request(app.getHttpServer())
      .get(`/api/v1/proposals/${source.id}`)
      .set(authHeaders(sales));
    expect(sourceAfter.body.status).toBe("SENT");
    expect(sourceAfter.body.lineItems).toHaveLength(1);
    expect(sourceAfter.body.lineItems[0].description).toBe("Frozen line");
  });

  it("audit trail: send, transition, and revise each produce a distinct, correctly-attributed AuditLog row", async () => {
    const deal = await createTestDeal(app, sales.organizationId, sales.userId);
    const proposal = await createTestProposal(app, sales.organizationId, deal.id, sales.userId);

    await request(app.getHttpServer()).post(`/api/v1/proposals/${proposal.id}/send`).set(authHeaders(sales));
    await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/transition`)
      .set(authHeaders(sales))
      .send({ to: "VIEWED" });
    const reviseResponse = await request(app.getHttpServer())
      .post(`/api/v1/proposals/${proposal.id}/revise`)
      .set(authHeaders(sales));

    const prisma = app.get(PrismaService);
    const sentAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "Proposal", entity_id: proposal.id, action: "proposal.sent", actor_id: sales.userId },
    });
    const transitionAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "Proposal", entity_id: proposal.id, action: "proposal.transitioned", actor_id: sales.userId },
    });
    const revisedAudit = await prisma.auditLog.findFirst({
      where: {
        entity_type: "Proposal",
        entity_id: reviseResponse.body.id as string,
        action: "proposal.revised",
        actor_id: sales.userId,
      },
    });
    expect(sentAudit).not.toBeNull();
    expect(transitionAudit).not.toBeNull();
    expect(revisedAudit).not.toBeNull();
  });
});
