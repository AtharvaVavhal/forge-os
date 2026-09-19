import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures, createSecondOrganization, createTestUser } from "./support/fixtures";
import { loginSession, authHeaders, cleanupTeamSharedTestData, type AuthSession } from "./support/team-shared";
import {
  cleanupEarningsFixtures,
  createEarningsCompany,
  createEarningsCreditNote,
  createEarningsExpense,
  createEarningsInvoice,
  createEarningsPayment,
  createEarningsProject,
  createEarningsRefund,
  earningsMutateHeaders,
  EARNINGS_TEST_PREFIX,
} from "./support/earnings";
import { PrismaService } from "../src/database/prisma.service";

describe("K11 — Project Revenue & Team Allocations (e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;
  let operations: AuthSession;
  let memberA: AuthSession;
  let memberB: AuthSession;
  let inactiveMember: AuthSession;
  let secondOrgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE", { emailSuffix: "k11-finance" });
    operations = await loginSession(app, "OPERATIONS", { emailSuffix: "k11-ops" });
    memberA = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k11-member-a" });
    memberB = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k11-member-b" });
    inactiveMember = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k11-inactive", active: true });
    // Deactivate after login (login itself would reject an inactive user).
    await app.get(PrismaService).user.update({ where: { id: inactiveMember.userId }, data: { active: false } });
    // This system is single-tenant at login (OrganizationContextService always
    // resolves the one primary org — see organization-isolation.e2e-spec.ts), so
    // a second-org user cannot log in via /auth/login at all. Cross-org isolation
    // is therefore tested the same way finance-security.e2e-spec.ts does it: create
    // the target resource directly in the second org via Prisma, then confirm the
    // PRIMARY org's authenticated session gets a non-leaking 404 against it.
    secondOrgId = await createSecondOrganization(app);
  });

  afterAll(async () => {
    await cleanupEarningsFixtures(app);
    await cleanupTeamSharedTestData(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  async function setupProjectWithRevenue(opts?: { paymentAmount?: string; refundAmount?: string; expenseAmount?: string }) {
    const company = await createEarningsCompany(app, finance.organizationId);
    const project = await createEarningsProject(app, finance.organizationId, company.id, finance.userId);
    const invoice = await createEarningsInvoice(app, finance.organizationId, company.id, project.id, {
      amount: opts?.paymentAmount ?? "10000.00",
    });
    const payment = await createEarningsPayment(app, finance.organizationId, invoice.id, finance.userId, {
      amount: opts?.paymentAmount ?? "10000.00",
    });
    if (opts?.refundAmount) {
      await createEarningsRefund(app, finance.organizationId, payment.id, finance.userId, { amount: opts.refundAmount });
    }
    if (opts?.expenseAmount) {
      await createEarningsExpense(app, finance.organizationId, finance.userId, {
        projectId: project.id,
        amount: opts.expenseAmount,
      });
    }
    return { company, project, invoice, payment };
  }

  it("computes project revenue from COMPLETED payments only", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "8000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id });
    expect(created.status).toBe(201);
    expect(created.body.revenue).toBe("8000.00");
    expect(created.body.distributable).toBe("8000.00");
  });

  it("completed refunds reduce revenue; credit notes never do (cash-basis, documentation only)", async () => {
    const { project, invoice } = await setupProjectWithRevenue({ paymentAmount: "8000.00", refundAmount: "1500.00" });
    await createEarningsCreditNote(app, finance.organizationId, invoice.id, finance.userId, { amount: "999.00" });

    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id });
    expect(created.status).toBe(201);
    // 8000 - 1500 refund = 6500; the 999 credit note must not appear anywhere in this figure.
    expect(created.body.revenue).toBe("6500.00");
    expect(created.body.distributable).toBe("6500.00");
  });

  it("subtracts project expenses from the distributable pool", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "8000.00", expenseAmount: "2000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id });
    expect(created.status).toBe(201);
    expect(created.body.revenue).toBe("8000.00");
    expect(created.body.expenses).toBe("2000.00");
    expect(created.body.distributable).toBe("6000.00");
  });

  it("floors distributable at zero when expenses exceed revenue", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "1000.00", expenseAmount: "5000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id });
    expect(created.status).toBe(201);
    expect(created.body.distributable).toBe("0.00");
  });

  it("rejects a duplicate member line within one allocation round", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const response = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({
        projectId: project.id,
        lines: [
          { userId: memberA.userId, amount: "1000.00" },
          { userId: memberA.userId, amount: "500.00" },
        ],
      });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("DUPLICATE_MEMBER_LINE");
  });

  it("rejects a negative line amount in a normal (non-adjustment) round", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const response = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "-100.00" }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("ALLOCATION_LINE_MUST_BE_POSITIVE");
  });

  it("rejects a line referencing an inactive member with MEMBER_INACTIVE (409), never a negative balance", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const response = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: inactiveMember.userId, amount: "100.00" }] });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("MEMBER_INACTIVE");
  });

  it("cumulative approved allocations may never exceed the live distributable pool", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });

    const first = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "4000.00" }] });
    expect(first.status).toBe(201);
    const approveFirst = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${first.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: first.body.version });
    expect(approveFirst.status).toBe(200);
    expect(approveFirst.body.projectCumulativeApprovedTotal).toBe("4000.00");

    const second = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberB.userId, amount: "2000.00" }] });
    expect(second.status).toBe(201);
    const approveSecond = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${second.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: second.body.version });
    expect(approveSecond.status).toBe(422);
    expect(approveSecond.body.error.code).toBe("ALLOCATION_EXCEEDS_DISTRIBUTABLE_POOL");
  });

  it("concurrent approval of two rounds whose combined total exceeds the pool: exactly one wins", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "6000.00" });

    const [roundA, roundB] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/v1/project-allocations")
        .set(earningsMutateHeaders(finance))
        .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "4000.00" }] }),
      request(app.getHttpServer())
        .post("/api/v1/project-allocations")
        .set(earningsMutateHeaders(finance))
        .send({ projectId: project.id, lines: [{ userId: memberB.userId, amount: "4000.00" }] }),
    ]);
    expect(roundA.status).toBe(201);
    expect(roundB.status).toBe(201);

    const [approveA, approveB] = await Promise.all([
      request(app.getHttpServer())
        .post(`/api/v1/project-allocations/${roundA.body.id}/approve`)
        .set(earningsMutateHeaders(finance))
        .send({ version: roundA.body.version }),
      request(app.getHttpServer())
        .post(`/api/v1/project-allocations/${roundB.body.id}/approve`)
        .set(earningsMutateHeaders(finance))
        .send({ version: roundB.body.version }),
    ]);
    const statuses = [approveA.status, approveB.status].sort();
    // Exactly one of the two 4000-vs-4000-against-a-6000-pool approvals succeeds — the
    // Project-row FOR UPDATE lock serializes them, so the second always recomputes
    // and sees the first's total already counted against the pool.
    expect(statuses).toEqual([200, 422]);

    const finalTotal = await request(app.getHttpServer())
      .get(`/api/v1/project-allocations/${roundA.body.id}`)
      .set(authHeaders(finance));
    expect(Number(finalTotal.body.projectCumulativeApprovedTotal)).toBeLessThanOrEqual(6000);
  });

  it("duplicate/repeat approval of an already-approved round is rejected, never double-applied", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "1000.00" }] });
    const firstApprove = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: created.body.version });
    expect(firstApprove.status).toBe(200);

    const secondApprove = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: firstApprove.body.version });
    expect(secondApprove.status).toBe(409);

    const staleVersionApprove = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: created.body.version });
    expect(staleVersionApprove.status).toBe(409);
  });

  it("an approved allocation and its lines are immutable — no PATCH lines, no re-cancel", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "1000.00" }] });
    const approved = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: created.body.version });
    expect(approved.status).toBe(200);

    const patchAttempt = await request(app.getHttpServer())
      .patch(`/api/v1/project-allocations/${created.body.id}/lines`)
      .set(authHeaders(finance))
      .send({ version: approved.body.version, lines: [{ userId: memberA.userId, amount: "2000.00" }] });
    expect(patchAttempt.status).toBe(409);
    expect(patchAttempt.body.error.code).toBe("PROJECT_ALLOCATION_NOT_EDITABLE");

    const cancelAttempt = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/cancel`)
      .set(earningsMutateHeaders(finance))
      .send({ version: approved.body.version });
    expect(cancelAttempt.status).toBe(409);
  });

  it("a DRAFT round may be cancelled; a cancelled round is terminal", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id });
    const cancelled = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/cancel`)
      .set(earningsMutateHeaders(finance))
      .send({ version: created.body.version });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.status).toBe("CANCELLED");

    const reapprove = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: cancelled.body.version });
    expect(reapprove.status).toBe(409);
  });

  it("an adjustment round may contain a negative (clawback) correction, and its total nets against cumulative approved", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "10000.00" });
    const original = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "5000.00" }] });
    const approvedOriginal = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${original.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: original.body.version });
    expect(approvedOriginal.status).toBe(200);

    const adjustment = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${original.body.id}/adjust`)
      .set(earningsMutateHeaders(finance))
      .send({});
    expect(adjustment.status).toBe(200);
    expect(adjustment.body.adjustmentOfId).toBe(original.body.id);
    expect(adjustment.body.status).toBe("DRAFT");

    const withNegativeLine = await request(app.getHttpServer())
      .patch(`/api/v1/project-allocations/${adjustment.body.id}/lines`)
      .set(authHeaders(finance))
      .send({ version: adjustment.body.version, lines: [{ userId: memberA.userId, amount: "-2000.00", note: "overpaid, correcting" }] });
    expect(withNegativeLine.status).toBe(200);
    expect(withNegativeLine.body.totalAllocated).toBe("-2000.00");

    const approvedAdjustment = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${adjustment.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: withNegativeLine.body.version });
    expect(approvedAdjustment.status).toBe(200);
    // 5000 (original) + (-2000) (correction) = 3000 net cumulative approved for the project.
    expect(approvedAdjustment.body.projectCumulativeApprovedTotal).toBe("3000.00");
  });

  it("a zero-amount adjustment line is rejected", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const original = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "1000.00" }] });
    await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${original.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: original.body.version });
    const adjustment = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${original.body.id}/adjust`)
      .set(earningsMutateHeaders(finance))
      .send({});
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/project-allocations/${adjustment.body.id}/lines`)
      .set(authHeaders(finance))
      .send({ version: adjustment.body.version, lines: [{ userId: memberA.userId, amount: "0.00" }] });
    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("ALLOCATION_LINE_AMOUNT_ZERO");
  });

  it("a refund recorded after an allocation is approved does not retroactively change the frozen snapshot", async () => {
    const { project, payment } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: memberA.userId, amount: "1000.00" }] });
    const approved = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: created.body.version });
    expect(approved.body.revenue).toBe("5000.00");

    await createEarningsRefund(app, finance.organizationId, payment.id, finance.userId, { amount: "2000.00" });

    const afterRefund = await request(app.getHttpServer())
      .get(`/api/v1/project-allocations/${created.body.id}`)
      .set(authHeaders(finance));
    // Frozen snapshot, not live-recomputed, once APPROVED.
    expect(afterRefund.body.revenue).toBe("5000.00");
    expect(afterRefund.body.distributable).toBe("5000.00");

    // A *new* round for the same project, however, does see the live (now-reduced) pool.
    const newRound = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id });
    expect(newRound.body.revenue).toBe("3000.00");
  });

  it("RBAC: finance.read may GET but not create/approve; OPERATIONS (no finance.*) is denied entirely", async () => {
    const { project } = await setupProjectWithRevenue({ paymentAmount: "5000.00" });
    const listAsOps = await request(app.getHttpServer())
      .get("/api/v1/project-allocations")
      .set(authHeaders(operations));
    expect(listAsOps.status).toBe(403);

    const createAsOps = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(operations))
      .send({ projectId: project.id });
    expect(createAsOps.status).toBe(403);
  });

  it("TEAM_MEMBER has no route access to project-allocations at all", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/project-allocations")
      .set(authHeaders(memberA));
    expect(response.status).toBe(403);
  });

  it("cross-organization access to a project allocation 404s, never leaking existence", async () => {
    const prisma = app.get(PrismaService);
    const otherOrgUser = await createTestUser(app, { role: "FOUNDER_ADMIN", organizationId: secondOrgId });
    const otherCompany = await prisma.company.create({
      data: { organization_id: secondOrgId, name: `${EARNINGS_TEST_PREFIX}other-org-company-${Date.now()}`, billing_state: "Delhi" },
    });
    const otherProject = await createEarningsProject(app, secondOrgId, otherCompany.id, otherOrgUser.id);
    const otherAllocation = await prisma.projectAllocation.create({
      data: { organization_id: secondOrgId, project_id: otherProject.id, created_by: otherOrgUser.id },
    });

    const crossOrgGet = await request(app.getHttpServer())
      .get(`/api/v1/project-allocations/${otherAllocation.id}`)
      .set(authHeaders(finance));
    expect(crossOrgGet.status).toBe(404);
  });
});
