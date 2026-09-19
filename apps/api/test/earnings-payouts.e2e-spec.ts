import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures, createSecondOrganization, createTestUser } from "./support/fixtures";
import { loginSession, authHeaders, cleanupTeamSharedTestData, type AuthSession } from "./support/team-shared";
import {
  cleanupEarningsFixtures,
  createEarningsCompany,
  createEarningsInvoice,
  createEarningsPayment,
  createEarningsProject,
  earningsMutateHeaders,
  upsertCompletePayoutProfile,
} from "./support/earnings";
import { PrismaService } from "../src/database/prisma.service";

describe("K12 — Team Earnings, Withdrawals & Payouts (e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;
  let operations: AuthSession;
  let member: AuthSession;
  let otherMember: AuthSession;
  let secondOrgId: string;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE", { emailSuffix: "k12-finance" });
    operations = await loginSession(app, "OPERATIONS", { emailSuffix: "k12-ops" });
    member = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-member" });
    otherMember = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-other-member" });
    // Single-tenant login (see organization-isolation.e2e-spec.ts) means a
    // second-org user cannot log in via /auth/login — the cross-org id test
    // below creates its target row directly via Prisma instead.
    secondOrgId = await createSecondOrganization(app);
  });

  afterAll(async () => {
    await cleanupEarningsFixtures(app);
    await cleanupTeamSharedTestData(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  /** Approves a `{ amount }` ProjectAllocation line for `beneficiary`, funded by a fresh COMPLETED payment on a fresh project. Returns the ids so callers can target this exact round later (e.g. for an adjustment) without an ambiguous list-and-guess lookup. */
  async function grantApprovedEarnings(
    beneficiary: AuthSession,
    amount: string
  ): Promise<{ projectId: string; allocationId: string }> {
    const company = await createEarningsCompany(app, finance.organizationId);
    const project = await createEarningsProject(app, finance.organizationId, company.id, finance.userId);
    const invoice = await createEarningsInvoice(app, finance.organizationId, company.id, project.id, { amount });
    await createEarningsPayment(app, finance.organizationId, invoice.id, finance.userId, { amount });
    const created = await request(app.getHttpServer())
      .post("/api/v1/project-allocations")
      .set(earningsMutateHeaders(finance))
      .send({ projectId: project.id, lines: [{ userId: beneficiary.userId, amount }] });
    expect(created.status).toBe(201);
    const approved = await request(app.getHttpServer())
      .post(`/api/v1/project-allocations/${created.body.id}/approve`)
      .set(earningsMutateHeaders(finance))
      .send({ version: created.body.version });
    expect(approved.status).toBe(200);
    return { projectId: project.id, allocationId: created.body.id as string };
  }

  describe("earnings summary", () => {
    it("a member with no allocations sees all zeros", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/team/earnings").set(authHeaders(otherMember));
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ available: "0.00", pending: "0.00", lifetimeEarned: "0.00", lifetimePaid: "0.00" });
    });

    it("an approved allocation line raises lifetimeEarned and available; appears in allocations history", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-summary" });
      await grantApprovedEarnings(beneficiary, "3000.00");

      const summary = await request(app.getHttpServer()).get("/api/v1/team/earnings").set(authHeaders(beneficiary));
      expect(summary.body).toEqual({ available: "3000.00", pending: "0.00", lifetimeEarned: "3000.00", lifetimePaid: "0.00" });

      const allocations = await request(app.getHttpServer())
        .get("/api/v1/team/earnings/allocations")
        .set(authHeaders(beneficiary));
      expect(allocations.status).toBe(200);
      expect(allocations.body.data).toHaveLength(1);
      expect(allocations.body.data[0].amount).toBe("3000.00");
    });

    it("recovery owed is floored at zero on the member's own Available, and future earnings transparently offset it", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-recovery" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      const { allocationId } = await grantApprovedEarnings(beneficiary, "5000.00");

      // Withdraw and pay out the full 5000.
      const payoutReq = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount: "5000.00" });
      expect(payoutReq.status).toBe(201);
      await advancePayoutToPaid(payoutReq.body.id);

      const afterPaid = await request(app.getHttpServer()).get("/api/v1/team/earnings").set(authHeaders(beneficiary));
      expect(afterPaid.body).toEqual({ available: "0.00", pending: "0.00", lifetimeEarned: "5000.00", lifetimePaid: "5000.00" });

      // Now correct the original grant down by 3000 (overpayment discovered) — an adjustment round.
      const adjustment = await request(app.getHttpServer())
        .post(`/api/v1/project-allocations/${allocationId}/adjust`)
        .set(earningsMutateHeaders(finance))
        .send({});
      const withLine = await request(app.getHttpServer())
        .patch(`/api/v1/project-allocations/${adjustment.body.id}/lines`)
        .set(authHeaders(finance))
        .send({ version: adjustment.body.version, lines: [{ userId: beneficiary.userId, amount: "-3000.00" }] });
      const approvedAdjustment = await request(app.getHttpServer())
        .post(`/api/v1/project-allocations/${adjustment.body.id}/approve`)
        .set(earningsMutateHeaders(finance))
        .send({ version: withLine.body.version });
      expect(approvedAdjustment.status).toBe(200);

      // lifetimeEarned = 5000 - 3000 = 2000; paid = 5000 -> netEarned(2000) - paid(5000) is negative -> Available floors at 0.
      // RecoveryOwed (2000-owed-back, Finance-only) is never surfaced as a negative member balance.
      const afterClawback = await request(app.getHttpServer()).get("/api/v1/team/earnings").set(authHeaders(beneficiary));
      expect(afterClawback.body.available).toBe("0.00");
      expect(afterClawback.body.lifetimeEarned).toBe("2000.00");
      expect(Number(afterClawback.body.available)).toBeGreaterThanOrEqual(0);

      // A fresh 4000 of new earnings: netEarned becomes 2000+4000=6000, exceeding the 5000 already
      // paid by only 1000 — proving the first 3000 of "new" earnings silently absorbed RecoveryOwed
      // rather than becoming available immediately.
      const company = await createEarningsCompany(app, finance.organizationId);
      const project = await createEarningsProject(app, finance.organizationId, company.id, finance.userId);
      const invoice = await createEarningsInvoice(app, finance.organizationId, company.id, project.id, { amount: "4000.00" });
      await createEarningsPayment(app, finance.organizationId, invoice.id, finance.userId, { amount: "4000.00" });
      const newRound = await request(app.getHttpServer())
        .post("/api/v1/project-allocations")
        .set(earningsMutateHeaders(finance))
        .send({ projectId: project.id, lines: [{ userId: beneficiary.userId, amount: "4000.00" }] });
      const newApproved = await request(app.getHttpServer())
        .post(`/api/v1/project-allocations/${newRound.body.id}/approve`)
        .set(earningsMutateHeaders(finance))
        .send({ version: newRound.body.version });
      expect(newApproved.status).toBe(200);

      const finalSummary = await request(app.getHttpServer()).get("/api/v1/team/earnings").set(authHeaders(beneficiary));
      expect(finalSummary.body.lifetimeEarned).toBe("6000.00");
      expect(finalSummary.body.available).toBe("1000.00");
    });
  });

  describe("withdrawal creation", () => {
    it("requires a complete payout profile", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-no-profile" });
      await grantApprovedEarnings(beneficiary, "1000.00");
      const response = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount: "500.00" });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe("PAYOUT_PROFILE_INCOMPLETE");
    });

    it("an exact-balance withdrawal succeeds", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-exact" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      await grantApprovedEarnings(beneficiary, "1500.00");
      const response = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount: "1500.00" });
      expect(response.status).toBe(201);
      expect(response.body.amount).toBe("1500.00");
      expect(response.body.status).toBe("REQUESTED");

      const summary = await request(app.getHttpServer()).get("/api/v1/team/earnings").set(authHeaders(beneficiary));
      expect(summary.body.available).toBe("0.00");
      expect(summary.body.pending).toBe("1500.00");
    });

    it("an over-balance withdrawal is rejected", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-over" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      await grantApprovedEarnings(beneficiary, "500.00");
      const response = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount: "500.01" });
      expect(response.status).toBe(422);
      expect(response.body.error.code).toBe("PAYOUT_EXCEEDS_AVAILABLE_BALANCE");
    });

    it("simultaneous withdrawal requests cannot jointly overdraw Available", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-concurrent" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      await grantApprovedEarnings(beneficiary, "3000.00");

      const [first, second] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/team/payouts")
          .set(earningsMutateHeaders(beneficiary))
          .send({ amount: "2000.00" }),
        request(app.getHttpServer())
          .post("/api/v1/team/payouts")
          .set(earningsMutateHeaders(beneficiary))
          .send({ amount: "2000.00" }),
      ]);
      const statuses = [first.status, second.status].sort();
      expect(statuses).toEqual([201, 422]);
    });

    it("a duplicate withdrawal request with the same Idempotency-Key replays the original response, not a second row", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-idempotent" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      await grantApprovedEarnings(beneficiary, "1000.00");
      const key = randomUUID();

      const first = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary, key))
        .send({ amount: "600.00" });
      expect(first.status).toBe(201);
      const second = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary, key))
        .send({ amount: "600.00" });
      expect(second.status).toBe(201);
      expect(second.body.id).toBe(first.body.id);

      const list = await request(app.getHttpServer()).get("/api/v1/team/payouts").set(authHeaders(beneficiary));
      expect(list.body.data).toHaveLength(1);
    });

    it("cannot address another member's payout by id — 404, not 403", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-owner" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      await grantApprovedEarnings(beneficiary, "800.00");
      const created = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount: "800.00" });

      const stolen = await request(app.getHttpServer())
        .get(`/api/v1/team/payouts/${created.body.id}`)
        .set(authHeaders(otherMember));
      expect(stolen.status).toBe(404);
    });

    it("cross-organization access to a payout 404s on the Finance side too, never leaking existence", async () => {
      // Single-tenant login means a second-org user can't authenticate at all
      // (see organization-isolation.e2e-spec.ts) — so the cross-org row is
      // created directly via Prisma and checked from the PRIMARY org's
      // Finance session, the same pattern finance-security.e2e-spec.ts uses.
      const prisma = app.get(PrismaService);
      const otherOrgUser = await createTestUser(app, { role: "FOUNDER_ADMIN", organizationId: secondOrgId });
      const otherPayout = await prisma.teamPayoutRequest.create({
        data: {
          organization_id: secondOrgId,
          user_id: otherOrgUser.id,
          amount: "100.00",
          payout_method: "UPI",
          destination_snapshot: { method: "UPI", upiId: "other-org@upi" },
        },
      });

      const crossOrg = await request(app.getHttpServer())
        .get(`/api/v1/payouts/${otherPayout.id}`)
        .set(authHeaders(finance));
      expect(crossOrg.status).toBe(404);
    });

    it("destination_snapshot is captured once at creation and never mutated by a later PayoutProfile change", async () => {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: "k12-snapshot" });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId, { accountNumber: "111100002222" });
      await grantApprovedEarnings(beneficiary, "700.00");
      const created = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount: "700.00" });
      expect(created.body.destination.accountNumber).toBe("111100002222");

      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId, { accountNumber: "999988887777" });

      const financeView = await request(app.getHttpServer())
        .get(`/api/v1/payouts/${created.body.id}`)
        .set(authHeaders(finance));
      expect(financeView.body.destination.accountNumber).toBe("111100002222");

      const ownView = await request(app.getHttpServer())
        .get(`/api/v1/team/payouts/${created.body.id}`)
        .set(authHeaders(beneficiary));
      expect(ownView.body.destination.accountNumber).toBe("111100002222");
    });
  });

  describe("Finance review pipeline", () => {
    async function createPendingPayout(amount = "1000.00"): Promise<{ beneficiary: AuthSession; payoutId: string }> {
      const beneficiary = await loginSession(app, "TEAM_MEMBER", { emailSuffix: `k12-pipeline-${Date.now()}` });
      await upsertCompletePayoutProfile(app, finance.organizationId, beneficiary.userId);
      await grantApprovedEarnings(beneficiary, amount);
      const created = await request(app.getHttpServer())
        .post("/api/v1/team/payouts")
        .set(earningsMutateHeaders(beneficiary))
        .send({ amount });
      return { beneficiary, payoutId: created.body.id as string };
    }

    it("happy path: REQUESTED -> UNDER_REVIEW -> APPROVED -> PROCESSING -> PAID, each step audited", async () => {
      const { payoutId } = await createPendingPayout();

      const reviewed = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/review`)
        .set(authHeaders(finance))
        .send({ version: 1 });
      expect(reviewed.status).toBe(200);
      expect(reviewed.body.status).toBe("UNDER_REVIEW");

      const approved = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/approve`)
        .set(authHeaders(finance))
        .send({ version: reviewed.body.version });
      expect(approved.body.status).toBe("APPROVED");

      const processing = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/process`)
        .set(authHeaders(finance))
        .send({ version: approved.body.version, processor: "razorpayx" });
      expect(processing.body.status).toBe("PROCESSING");

      const paid = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/mark-paid`)
        .set(earningsMutateHeaders(finance))
        .send({ externalReference: "UTR123456" });
      expect(paid.body.status).toBe("PAID");
      expect(paid.body.externalReference).toBe("UTR123456");

      const auditRows = await app.get(PrismaService).auditLog.findMany({
        where: { entity_type: "TeamPayoutRequest", entity_id: payoutId },
        orderBy: { created_at: "asc" },
      });
      expect(auditRows.map((r) => r.action)).toEqual([
        "team_payout.requested",
        "team_payout.reviewed",
        "team_payout.approved",
        "team_payout.processing_started",
        "team_payout.paid",
      ]);
    });

    it("duplicate approval with a stale version is rejected (409), never double-applied", async () => {
      const { payoutId } = await createPendingPayout();
      const reviewed = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/review`)
        .set(authHeaders(finance))
        .send({ version: 1 });
      const approved = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/approve`)
        .set(authHeaders(finance))
        .send({ version: reviewed.body.version });
      expect(approved.status).toBe(200);

      const staleApprove = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/approve`)
        .set(authHeaders(finance))
        .send({ version: reviewed.body.version });
      expect(staleApprove.status).toBe(409);
    });

    it("duplicate mark-paid on an already-PAID request returns 200 unchanged", async () => {
      const { payoutId } = await advancePayoutToProcessing(await createPendingPayout());
      const first = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/mark-paid`)
        .set(earningsMutateHeaders(finance))
        .send({ externalReference: "UTR-FIRST" });
      expect(first.status).toBe(200);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/mark-paid`)
        .set(earningsMutateHeaders(finance)) // fresh Idempotency-Key — this is a genuine retry, not a cached replay
        .send({ externalReference: "UTR-SECOND-IGNORED" });
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("PAID");
      expect(second.body.externalReference).toBe("UTR-FIRST");
      expect(second.body.version).toBe(first.body.version);
    });

    it("a failed payout may be retried: PROCESSING -> FAILED -> PROCESSING -> PAID", async () => {
      const { payoutId, version } = await advancePayoutToProcessing(await createPendingPayout());
      const failed = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/mark-failed`)
        .set(authHeaders(finance))
        .send({ version, reason: "bank rejected transfer" });
      expect(failed.body.status).toBe("FAILED");

      const retried = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/process`)
        .set(authHeaders(finance))
        .send({ version: failed.body.version, processor: "razorpayx-retry" });
      expect(retried.body.status).toBe("PROCESSING");

      const paid = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${payoutId}/mark-paid`)
        .set(earningsMutateHeaders(finance))
        .send({ externalReference: "UTR-RETRY-OK" });
      expect(paid.body.status).toBe("PAID");
    });

    it("REQUESTED and UNDER_REVIEW both accept a direct rejection; PAID/REJECTED are terminal", async () => {
      const { payoutId: requestedId } = await createPendingPayout();
      const rejectedFromRequested = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${requestedId}/reject`)
        .set(authHeaders(finance))
        .send({ version: 1, reason: "policy violation" });
      expect(rejectedFromRequested.body.status).toBe("REJECTED");

      const reapprove = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${requestedId}/review`)
        .set(authHeaders(finance))
        .send({ version: rejectedFromRequested.body.version });
      expect(reapprove.status).toBe(409);

      const { payoutId: underReviewId } = await createPendingPayout();
      const reviewed = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${underReviewId}/review`)
        .set(authHeaders(finance))
        .send({ version: 1 });
      const rejectedFromReview = await request(app.getHttpServer())
        .post(`/api/v1/payouts/${underReviewId}/reject`)
        .set(authHeaders(finance))
        .send({ version: reviewed.body.version, reason: "duplicate request" });
      expect(rejectedFromReview.body.status).toBe("REJECTED");
    });

    it("sensitive destination fields are never written to the audit log for any team_payout.* event", async () => {
      const { payoutId } = await createPendingPayout();
      const payout = await app.get(PrismaService).teamPayoutRequest.findUniqueOrThrow({ where: { id: payoutId } });
      const snapshot = payout.destination_snapshot as { accountNumber: string; ifsc: string; upiId: string };

      await advancePayoutToPaid(payoutId);

      const auditRows = await app.get(PrismaService).auditLog.findMany({
        where: { entity_type: "TeamPayoutRequest", entity_id: payoutId },
      });
      const serialized = JSON.stringify(auditRows.map((r) => ({ before: r.before, after: r.after })));
      expect(serialized).not.toContain(snapshot.accountNumber);
      expect(serialized).not.toContain(snapshot.ifsc);
      expect(serialized).not.toContain(snapshot.upiId);
    });

    it("RBAC: GET /payouts requires finance.manage — OPERATIONS and TEAM_MEMBER are denied", async () => {
      const { payoutId } = await createPendingPayout();
      const listAsOps = await request(app.getHttpServer()).get("/api/v1/payouts").set(authHeaders(operations));
      expect(listAsOps.status).toBe(403);
      const getAsOps = await request(app.getHttpServer()).get(`/api/v1/payouts/${payoutId}`).set(authHeaders(operations));
      expect(getAsOps.status).toBe(403);
      const getAsMember = await request(app.getHttpServer()).get(`/api/v1/payouts/${payoutId}`).set(authHeaders(member));
      expect(getAsMember.status).toBe(403);
    });
  });

  /** Drives a freshly-REQUESTED payout through review -> approve -> process (leaves it PROCESSING, version 3). */
  async function advancePayoutToProcessing(pending: { payoutId: string }): Promise<{ payoutId: string; version: number }> {
    const reviewed = await request(app.getHttpServer())
      .post(`/api/v1/payouts/${pending.payoutId}/review`)
      .set(authHeaders(finance))
      .send({ version: 1 });
    const approved = await request(app.getHttpServer())
      .post(`/api/v1/payouts/${pending.payoutId}/approve`)
      .set(authHeaders(finance))
      .send({ version: reviewed.body.version });
    const processing = await request(app.getHttpServer())
      .post(`/api/v1/payouts/${pending.payoutId}/process`)
      .set(authHeaders(finance))
      .send({ version: approved.body.version });
    return { payoutId: pending.payoutId, version: processing.body.version as number };
  }

  /** Drives a freshly-REQUESTED payout all the way to PAID. */
  async function advancePayoutToPaid(payoutId: string): Promise<void> {
    await advancePayoutToProcessing({ payoutId });
    const paid = await request(app.getHttpServer())
      .post(`/api/v1/payouts/${payoutId}/mark-paid`)
      .set(earningsMutateHeaders(finance))
      .send({ externalReference: `UTR-${payoutId.slice(0, 8)}` });
    expect(paid.status).toBe(200);
  }
});
