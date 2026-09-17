import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures } from "./support/fixtures";
import { authHeaders, loginSession, type AuthSession } from "./support/crm";
import {
  cleanupFinanceFixtures,
  createTestCompany,
  createTestExpense,
  createTestForgeFundEntry,
  createTestInvoice,
  financeMutateHeaders
} from "./support/finance";
import { PrismaService } from "../src/database/prisma.service";

describe("Finance — Credit Notes, Expenses, Forge Fund (e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;
  let operations: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE");
    operations = await loginSession(app, "OPERATIONS");
  });

  afterAll(async () => {
    await cleanupFinanceFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("15. credit notes: create against an invoice, amount may be 0 (documentation-only)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });

    const response = await request(app.getHttpServer())
      .post("/api/v1/credit-notes")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, reason: "PRICING_ERROR", amount: "0.00" });
    expect(response.status).toBe(201);
    expect(response.body.amount).toBe("0.00");
    expect(response.body.creditNoteNumber).toMatch(/^CN-\d{4}-\d{2}-\d{4}$/);

    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/credit-notes/${response.body.id}`)
      .set(authHeaders(finance));
    expect(getResponse.status).toBe(200);
    expect(getResponse.body.invoice.id).toBe(invoice.id);
  });

  it("16/17. credit-note numbering + concurrency: concurrent issues on different invoices never collide", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoiceA = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });
    const invoiceB = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/v1/credit-notes")
        .set(financeMutateHeaders(finance))
        .send({ invoiceId: invoiceA.id, reason: "GOODWILL", amount: "100.00" }),
      request(app.getHttpServer())
        .post("/api/v1/credit-notes")
        .set(financeMutateHeaders(finance))
        .send({ invoiceId: invoiceB.id, reason: "GOODWILL", amount: "100.00" }),
    ]);
    expect(responseA.status).toBe(201);
    expect(responseB.status).toBe(201);
    expect(responseA.body.creditNoteNumber).not.toBe(responseB.body.creditNoteNumber);
  });

  it("18. expenses: create/update, project optional, recordedBy defaults to actor", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/expenses")
      .set(financeMutateHeaders(finance))
      .send({ description: "AWS bill", amount: "1500.00", category: "hosting", incurredAt: "2026-01-05" });
    expect(createResponse.status).toBe(201);
    expect(createResponse.body.recordedBy).toBe(finance.userId);
    expect(createResponse.body.projectId).toBeNull();

    const updateResponse = await request(app.getHttpServer())
      .patch(`/api/v1/expenses/${createResponse.body.id}`)
      .set(authHeaders(finance))
      .send({ amount: "1600.00" });
    expect(updateResponse.status).toBe(200);
    expect(updateResponse.body.amount).toBe("1600.00");
  });

  it("expenses: no GET /expenses/:id route exists (not in the frozen inventory)", async () => {
    const expense = await createTestExpense(app, finance.organizationId, finance.userId);
    const response = await request(app.getHttpServer())
      .get(`/api/v1/expenses/${expense.id}`)
      .set(authHeaders(finance));
    expect(response.status).toBe(404);
  });

  it("19. Forge Fund ledger: manual CONTRIBUTION is positive, WITHDRAWAL/ALLOCATION are stored negative from a positive client input", async () => {
    const contribution = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(finance))
      .send({ type: "CONTRIBUTION", amount: "5000.00", reason: "Client payment share", sourceType: null, sourceId: null });
    expect(contribution.status).toBe(201);
    expect(contribution.body.amount).toBe("5000.00");

    const allocation = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(finance))
      .send({ type: "ALLOCATION", amount: "2000.00", reason: "Allocated to member X for project Y", sourceType: null, sourceId: null });
    expect(allocation.status).toBe(201);
    expect(allocation.body.amount).toBe("-2000.00");

    const balance = await request(app.getHttpServer()).get("/api/v1/forge-fund/balance").set(authHeaders(finance));
    expect(balance.status).toBe(200);
    expect(typeof balance.body.balance).toBe("string");
  });

  it("no hard-coded 60/40 split — an ALLOCATION amount is exactly the client-supplied reason/amount, no derived split", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(finance))
      .send({ type: "ALLOCATION", amount: "12000.00", reason: "Explicit allocation, not a fixed split", sourceType: null, sourceId: null });
    expect(response.status).toBe(201);
    expect(response.body.amount).toBe("-12000.00");
  });

  it("20. append-only: no PATCH/PUT/DELETE route exists for a ForgeFundEntry", async () => {
    const entry = await createTestForgeFundEntry(app, finance.organizationId, finance.userId);
    // Attempting any mutation verb against the detail route must not be an
    // implemented, reachable endpoint — Nest returns 404 for a method
    // this controller never registered on this path.
    const patchAttempt = await request(app.getHttpServer())
      .patch(`/api/v1/forge-fund-entries/${entry.id}`)
      .set(authHeaders(finance))
      .send({ amount: "999.00" });
    expect(patchAttempt.status).toBe(404);

    const deleteAttempt = await request(app.getHttpServer())
      .delete(`/api/v1/forge-fund-entries/${entry.id}`)
      .set(authHeaders(finance));
    expect(deleteAttempt.status).toBe(404);

    // The row itself is genuinely unchanged.
    const getResponse = await request(app.getHttpServer())
      .get(`/api/v1/forge-fund-entries/${entry.id}`)
      .set(authHeaders(finance));
    expect(getResponse.body.amount).toBe("1000.00");
  });

  it("manual entries always have source_type/source_id null — a client cannot set an arbitrary source", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(finance))
      .send({ type: "CONTRIBUTION", amount: "100.00", reason: "test", sourceType: "payment", sourceId: "11111111-1111-1111-1111-111111111111" });
    expect(response.status).toBe(400);
  });

  it("RBAC: forge_fund.manage + forge_fund.approve are both required; OPERATIONS has neither", async () => {
    const response = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(operations))
      .send({ type: "CONTRIBUTION", amount: "100.00", reason: "test", sourceType: null, sourceId: null });
    expect(response.status).toBe(403);
  });

  it("RBAC: forge_fund.read denies OPERATIONS on the ledger and balance", async () => {
    const listResponse = await request(app.getHttpServer()).get("/api/v1/forge-fund-entries").set(authHeaders(operations));
    expect(listResponse.status).toBe(403);
    const balanceResponse = await request(app.getHttpServer()).get("/api/v1/forge-fund/balance").set(authHeaders(operations));
    expect(balanceResponse.status).toBe(403);
  });

  it("tax rates: finance.manage can create/update; finance.read can list only", async () => {
    const createResponse = await request(app.getHttpServer())
      .post("/api/v1/tax-rates")
      .set(financeMutateHeaders(finance))
      .send({
        hsnSacCode: `${Date.now()}`.slice(-6),
        description: "phase-b5-e2e-test tax rate",
        cgstRate: "9.00",
        sgstRate: "9.00",
        igstRate: "18.00",
        effectiveFrom: "2020-01-01",
      });
    expect(createResponse.status).toBe(201);

    const listResponse = await request(app.getHttpServer()).get("/api/v1/tax-rates").set(authHeaders(operations));
    expect(listResponse.status).toBe(403);

    const prisma = app.get(PrismaService);
    await prisma.taxRate.delete({ where: { id: createResponse.body.id } });
  });

  it("sequences: read-only, finance.read", async () => {
    const invoiceSeq = await request(app.getHttpServer()).get("/api/v1/invoice-sequences").set(authHeaders(finance));
    expect(invoiceSeq.status).toBe(200);
    const creditNoteSeq = await request(app.getHttpServer())
      .get("/api/v1/credit-note-sequences")
      .set(authHeaders(finance));
    expect(creditNoteSeq.status).toBe(200);
  });
});
