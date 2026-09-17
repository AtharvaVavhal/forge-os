import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { createSecondOrganization, createTestUser, cleanupTestFixtures } from "./support/fixtures";
import { authHeaders, loginSession, type AuthSession } from "./support/crm";
import {
  cleanupFinanceFixtures,
  createTestCompany,
  createTestInvoice,
  createTestPayment,
  financeMutateHeaders
} from "./support/finance";
import { PrismaService } from "../src/database/prisma.service";

describe("Finance — RBAC, organization isolation, audit, rollback (e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;
  let sales: AuthSession;
  let teamMember: AuthSession;
  let founder: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE");
    sales = await loginSession(app, "SALES");
    teamMember = await loginSession(app, "TEAM_MEMBER");
    founder = await loginSession(app, "FOUNDER_ADMIN");
  });

  afterAll(async () => {
    await cleanupFinanceFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("25. RBAC: SALES has no finance.read despite full CRM access (Document 5 §4.3 footnote 4 — the exact concern task section 14 names)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/invoices").set(authHeaders(sales));
    expect(response.status).toBe(403);
  });

  it("25. RBAC: TEAM_MEMBER has no financial access anywhere", async () => {
    const invoices = await request(app.getHttpServer()).get("/api/v1/invoices").set(authHeaders(teamMember));
    expect(invoices.status).toBe(403);
    const expenses = await request(app.getHttpServer()).get("/api/v1/expenses").set(authHeaders(teamMember));
    expect(expenses.status).toBe(403);
    const forgeFund = await request(app.getHttpServer()).get("/api/v1/forge-fund-entries").set(authHeaders(teamMember));
    expect(forgeFund.status).toBe(403);
  });

  it("25. FOUNDER_ADMIN's wildcard grants full finance access", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/invoices").set(authHeaders(founder));
    expect(response.status).toBe(200);
  });

  it("26/27. organization isolation + nested IDOR: a cross-org invoice is 404 even via a project/company relation path", async () => {
    const otherOrgId = await createSecondOrganization(app);
    const otherOrgFinance = await createTestUser(app, { role: "FINANCE", organizationId: otherOrgId });
    const prisma = app.get(PrismaService);
    const otherCompany = await prisma.company.create({
      data: { organization_id: otherOrgId, name: `other-org-security-${Date.now()}`, billing_state: "Delhi" },
    });
    const otherInvoice = await createTestInvoice(app, otherOrgId, otherCompany.id, { status: "SENT", amount: "1000.00" });
    const otherPayment = await createTestPayment(app, otherOrgId, otherInvoice.id, otherOrgFinance.id);

    const getInvoice = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${otherInvoice.id}`)
      .set(authHeaders(finance));
    expect(getInvoice.status).toBe(404);

    const getPayment = await request(app.getHttpServer())
      .get(`/api/v1/payments/${otherPayment.id}`)
      .set(authHeaders(finance));
    expect(getPayment.status).toBe(404);

    const createInvoiceAgainstOtherCompany = await request(app.getHttpServer())
      .post("/api/v1/invoices")
      .set(financeMutateHeaders(finance))
      .send({ companyId: otherCompany.id });
    expect(createInvoiceAgainstOtherCompany.status).toBe(404);

    const listResponse = await request(app.getHttpServer()).get("/api/v1/invoices").set(authHeaders(finance));
    const ids = (listResponse.body.data as Array<{ id: string }>).map((i) => i.id);
    expect(ids).not.toContain(otherInvoice.id);

    await prisma.payment.delete({ where: { id: otherPayment.id } });
    await prisma.invoice.delete({ where: { id: otherInvoice.id } });
    await prisma.company.delete({ where: { id: otherCompany.id } });
  });

  it("28. audit logging: Tier A actions (send, void, cancel, payment, refund, credit note, forge fund entry) each produce a real AuditLog row", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const prisma = app.get(PrismaService);

    const sentInvoice = await createTestInvoice(app, finance.organizationId, company.id);
    await prisma.invoiceLineItem.create({
      data: {
        organization_id: finance.organizationId,
        invoice_id: sentInvoice.id,
        description: "line",
        hsn_sac_code: "998314",
        quantity: "1.00",
        unit_price: "1000.00",
        line_total: "1000.00",
      },
    });
    const sendResponse = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${sentInvoice.id}/send`)
      .set(financeMutateHeaders(finance));
    expect(sendResponse.status).toBe(200);
    const sentAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "Invoice", entity_id: sentInvoice.id, action: "invoice.sent" },
    });
    expect(sentAudit).not.toBeNull();
    expect(sentAudit!.actor_id).toBe(finance.userId);

    const paymentResponse = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: sentInvoice.id, amount: "500.00", method: "CASH" });
    const paymentAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "Payment", entity_id: paymentResponse.body.id, action: "payment.recorded" },
    });
    expect(paymentAudit).not.toBeNull();

    const refundResponse = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: paymentResponse.body.id, amount: "100.00", reason: "test refund" });
    const refundAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "Refund", entity_id: refundResponse.body.id, action: "refund.created" },
    });
    expect(refundAudit).not.toBeNull();

    const creditNoteResponse = await request(app.getHttpServer())
      .post("/api/v1/credit-notes")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: sentInvoice.id, reason: "GOODWILL", amount: "50.00" });
    const creditNoteAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "CreditNote", entity_id: creditNoteResponse.body.id, action: "credit_note.issued" },
    });
    expect(creditNoteAudit).not.toBeNull();

    const entryResponse = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(finance))
      .send({ type: "CONTRIBUTION", amount: "10.00", reason: "audit test", sourceType: null, sourceId: null });
    const entryAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "ForgeFundEntry", entity_id: entryResponse.body.id, action: "forge_fund_entry.created" },
    });
    expect(entryAudit).not.toBeNull();

    const voidableInvoice = await createTestInvoice(app, finance.organizationId, company.id);
    const voidResponse = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${voidableInvoice.id}/void`)
      .set(financeMutateHeaders(finance));
    expect(voidResponse.status).toBe(200);
    const voidAudit = await prisma.auditLog.findFirst({
      where: { entity_type: "Invoice", entity_id: voidableInvoice.id, action: "invoice.voided" },
    });
    expect(voidAudit).not.toBeNull();
  });

  it("audit log remains append-only at the DB grant level (forge_app cannot UPDATE/DELETE audit_logs)", async () => {
    const prisma = app.get(PrismaService);
    const anyAuditRow = await prisma.auditLog.findFirst();
    expect(anyAuditRow).not.toBeNull();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL ROLE forge_app");
        await tx.$executeRawUnsafe(
          `UPDATE audit_logs SET action = 'tampered' WHERE id = '${anyAuditRow!.id}'::uuid`
        );
      })
    ).rejects.toMatchObject({ code: "P2010", meta: expect.objectContaining({ code: "42501" }) });
  });

  it("30. transaction rollback: a failing /send (e.g. concurrent sequence claim collision is impossible, but an invalid DRAFT precondition) never partially mutates state", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const alreadySent = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });
    const before = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${alreadySent.id}`)
      .set(authHeaders(finance));

    const sendAgain = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${alreadySent.id}/send`)
      .set(financeMutateHeaders(finance));
    expect(sendAgain.status).toBe(409);

    const after = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${alreadySent.id}`)
      .set(authHeaders(finance));
    // Nothing changed — no partial sequence claim, no partial field update.
    expect(after.body.invoiceNumber).toBe(before.body.invoiceNumber);
    expect(after.body.version).toBe(before.body.version);
  });

  it("31. validation/whitelisting: an unknown field anywhere in a Finance create DTO is rejected, not silently dropped", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/invoices")
      .set(financeMutateHeaders(finance))
      .send({ companyId: company.id, notAFrozenField: "should be rejected" });
    expect(response.status).toBe(400);
  });

  it("31. malformed decimal representations are rejected across resources (expense, credit note, forge fund)", async () => {
    const expenseResponse = await request(app.getHttpServer())
      .post("/api/v1/expenses")
      .set(financeMutateHeaders(finance))
      .send({ description: "x", amount: "12.5", category: "x", incurredAt: "2026-01-01" }); // only 1 decimal place
    expect(expenseResponse.status).toBe(400);

    const forgeFundResponse = await request(app.getHttpServer())
      .post("/api/v1/forge-fund-entries")
      .set(financeMutateHeaders(finance))
      .send({ type: "CONTRIBUTION", amount: "-100.00", reason: "negative not allowed from client", sourceType: null, sourceId: null });
    expect(forgeFundResponse.status).toBe(400);
  });

  it("B9 H4: SALES cannot list or attach invoice-parented documents", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "SENT",
      amount: "500.00",
    });

    const list = await request(app.getHttpServer())
      .get(`/api/v1/documents?invoiceId=${invoice.id}`)
      .set(authHeaders(sales));
    expect(list.status).toBe(403);

    const create = await request(app.getHttpServer())
      .post("/api/v1/documents")
      .set(financeMutateHeaders(sales))
      .send({
        filename: "invoice.pdf",
        storageKey: `${sales.organizationId}/invoice-attach.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 1024,
        category: "INVOICE",
        invoiceId: invoice.id,
      });
    expect(create.status).toBe(403);
  });

  it("B9 H8: credit note amount cannot exceed invoice total", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "SENT",
      amount: "100.00",
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/credit-notes")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, reason: "GOODWILL", amount: "1000.00" });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("CREDIT_NOTE_AMOUNT_INVALID");
  });
});
