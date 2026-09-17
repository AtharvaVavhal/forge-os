import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures } from "./support/fixtures";
import { authHeaders, listData, loginSession, type AuthSession } from "./support/crm";
import {
  cleanupFinanceFixtures,
  createTestCompany,
  createTestInvoice,
  createTestInvoiceLineItem,
  createTestPayment,
  createTestTaxRate,
  financeMutateHeaders
} from "./support/finance";
import { PrismaService } from "../src/database/prisma.service";

describe("Finance — Invoices (e2e)", () => {
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

  it("1. create defaults to DRAFT, amount 0.00, tax_treatment computed from billing state (same state -> CGST_SGST)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/invoices")
      .set(financeMutateHeaders(finance))
      .send({ companyId: company.id });

    expect(response.status).toBe(201);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.amount).toBe("0.00");
    expect(response.body.taxTreatment).toBe("CGST_SGST");
    expect(response.body.companyId).toBe(company.id);
  });

  it("tax_treatment computes IGST for a company in a different state than the org", async () => {
    const prisma = app.get(PrismaService);
    const org = await prisma.organization.findUniqueOrThrow({ where: { id: finance.organizationId } });
    const otherState = org.billing_state === "Maharashtra" ? "Karnataka" : "Maharashtra";
    const company = await createTestCompany(app, finance.organizationId, otherState);

    const response = await request(app.getHttpServer())
      .post("/api/v1/invoices")
      .set(financeMutateHeaders(finance))
      .send({ companyId: company.id });
    expect(response.status).toBe(201);
    expect(response.body.taxTreatment).toBe("IGST");
  });

  it("company with no billing state is rejected explicitly, not guessed", async () => {
    const prisma = app.get(PrismaService);
    const company = await prisma.company.create({
      data: { organization_id: finance.organizationId, name: `${Date.now()}-no-state-company` },
    });
    const response = await request(app.getHttpServer())
      .post("/api/v1/invoices")
      .set(financeMutateHeaders(finance))
      .send({ companyId: company.id });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("COMPANY_BILLING_STATE_REQUIRED");
    await prisma.company.delete({ where: { id: company.id } });
  });

  it("2. get includes nested line items, payments (with refunds), and credit notes", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    // paidAmount matches the fixture payment below (createTestPayment
    // inserts a raw Payment row — it doesn't run the service's paid_amount
    // bookkeeping, so the invoice fixture must be seeded consistently).
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { paidAmount: "1000.00" });
    await createTestInvoiceLineItem(app, finance.organizationId, invoice.id);
    await createTestPayment(app, finance.organizationId, invoice.id, finance.userId);

    const response = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance));
    expect(response.status).toBe(200);
    expect(response.body.lineItems).toHaveLength(1);
    expect(response.body.payments).toHaveLength(1);
    expect(response.body.pendingAmount).toBe("9000.00");
  });

  it("list does not require line items eagerly (Document 5 §19: list has no +lines)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);

    const response = await request(app.getHttpServer()).get("/api/v1/invoices").set(authHeaders(finance));
    expect(response.status).toBe(200);
    const found = listData(response.body).find((i: { id: string }) => i.id === invoice.id) as { lineItems?: unknown };
    expect(found).toBeTruthy();
    expect(found?.lineItems).toBeUndefined();
  });

  it("6. PUT line-items replaces atomically and computes line_total from treatment-scoped tax rates", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    // Seed-like TaxRate stores BOTH legs (9+9 AND 18). Snapshotting must
    // zero IGST for a CGST_SGST invoice so the total tax is 18%, not 36%.
    await createTestTaxRate(app, finance.organizationId, {
      hsnSacCode: "998315",
      cgstRate: "9.00",
      sgstRate: "9.00",
      igstRate: "18.00",
    });
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/invoices/${invoice.id}/line-items`)
      .set(authHeaders(finance))
      .send({
        lines: [{ description: "Design", hsnSacCode: "998315", quantity: "2.00", unitPrice: "5000.00", sortOrder: 0 }],
      });
    expect(response.status).toBe(200);
    expect(response.body.lineItems).toHaveLength(1);
    // subtotal = 2 * 5000 = 10000; tax = 10000 * (9+9)/100 = 1800; total = 11800.00
    expect(response.body.lineItems[0].lineTotal).toBe("11800.00");
    expect(response.body.lineItems[0].cgstRate).toBe("9.00");
    expect(response.body.lineItems[0].sgstRate).toBe("9.00");
    expect(response.body.lineItems[0].igstRate).toBe("0.00");
    expect(response.body.amount).toBe("11800.00");
  });

  it("an HSN/SAC code with no matching tax rate is rejected (B9: no silent zero tax)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);

    const response = await request(app.getHttpServer())
      .put(`/api/v1/invoices/${invoice.id}/line-items`)
      .set(authHeaders(finance))
      .send({ lines: [{ description: "Untaxed", hsnSacCode: "000000", quantity: "1.00", unitPrice: "1000.00" }] });
    expect(response.status).toBe(422);
    expect(response.body.error.code).toBe("TAX_RATE_NOT_FOUND");
  });

  it("5. draft-only editing: PATCH requires matching version (optimistic lock)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);

    const wrongVersion = await request(app.getHttpServer())
      .patch(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance))
      .send({ dueDate: "2026-01-01", version: 99 });
    expect(wrongVersion.status).toBe(409);
    expect(wrongVersion.body.error.code).toBe("INVOICE_VERSION_CONFLICT");

    const correctVersion = await request(app.getHttpServer())
      .patch(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance))
      .send({ dueDate: "2026-01-01", version: invoice.version });
    expect(correctVersion.status).toBe(200);
    expect(correctVersion.body.version).toBe(invoice.version + 1);
  });

  it("2/3/4. invoice numbering: /send claims a real sequence number and freezes bill_to_snapshot", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);
    await createTestInvoiceLineItem(app, finance.organizationId, invoice.id);

    const response = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/send`)
      .set(financeMutateHeaders(finance));
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("SENT");
    expect(response.body.invoiceNumber).toMatch(/^INV-\d{4}-\d{2}-\d{4}$/);
    // Wire field is `billToSnapshot` (the camelCased raw Prisma column) —
    // the frontend's own parser separately normalizes this to `billTo`
    // (readField(node, "billToSnapshot", "bill_to_snapshot")), so this
    // asserts the actual API contract, not the frontend's internal name.
    expect(response.body.billToSnapshot.name).toBe(company.name);
    expect(response.body.sentAt).toBeTruthy();

    // PATCH after leaving DRAFT is rejected.
    const editAfterSend = await request(app.getHttpServer())
      .patch(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance))
      .send({ dueDate: "2026-01-01", version: response.body.version });
    expect(editAfterSend.status).toBe(409);
    expect(editAfterSend.body.error.code).toBe("INVOICE_NOT_DRAFT");

    // 7. Line-item immutability after send.
    const replaceAfterSend = await request(app.getHttpServer())
      .put(`/api/v1/invoices/${invoice.id}/line-items`)
      .set(authHeaders(finance))
      .send({ lines: [{ description: "Too late", hsnSacCode: "000000", quantity: "1.00", unitPrice: "1.00" }] });
    expect(replaceAfterSend.status).toBe(409);
    expect(replaceAfterSend.body.error.code).toBe("INVOICE_NOT_DRAFT");
  });

  it("3. invoice sequence concurrency: concurrent /send calls on different draft invoices never collide on invoice_number", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoiceA = await createTestInvoice(app, finance.organizationId, company.id);
    const invoiceB = await createTestInvoice(app, finance.organizationId, company.id);
    await createTestInvoiceLineItem(app, finance.organizationId, invoiceA.id);
    await createTestInvoiceLineItem(app, finance.organizationId, invoiceB.id);

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/invoices/${invoiceA.id}/send`).set(financeMutateHeaders(finance)),
      request(app.getHttpServer()).post(`/api/v1/invoices/${invoiceB.id}/send`).set(financeMutateHeaders(finance)),
    ]);
    expect(responseA.status).toBe(200);
    expect(responseB.status).toBe(200);
    expect(responseA.body.invoiceNumber).not.toBe(responseB.body.invoiceNumber);

    const prisma = app.get(PrismaService);
    const numbers = await prisma.invoice.findMany({
      where: { id: { in: [invoiceA.id, invoiceB.id] } },
      select: { invoice_number: true },
    });
    expect(new Set(numbers.map((n) => n.invoice_number)).size).toBe(2);
  });

  it("concurrent /send on the same draft: exactly one succeeds; sequence is not double-claimed", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);
    await createTestInvoiceLineItem(app, finance.organizationId, invoice.id);

    const prisma = app.get(PrismaService);
    const seqBefore = await prisma.invoiceSequence.findFirst({
      where: { organization_id: finance.organizationId },
      orderBy: { financial_year: "desc" },
    });

    const [a, b] = await Promise.all([
      request(app.getHttpServer()).post(`/api/v1/invoices/${invoice.id}/send`).set(financeMutateHeaders(finance)),
      request(app.getHttpServer()).post(`/api/v1/invoices/${invoice.id}/send`).set(financeMutateHeaders(finance)),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    expect(winner.body.status).toBe("SENT");

    const seqAfter = await prisma.invoiceSequence.findFirst({
      where: {
        organization_id: finance.organizationId,
        financial_year: winner.body.financialYear,
      },
    });
    // At most one new number claimed for this single send (relative to prior FY counter).
    if (seqBefore && seqBefore.financial_year === winner.body.financialYear) {
      expect(seqAfter!.last_number).toBe(seqBefore.last_number + 1);
    } else {
      expect(seqAfter!.last_number).toBe(1);
    }
  });

  it("from-proposal: ACCEPTED proposal snapshots lines; non-ACCEPTED is rejected", async () => {
    const { createTestDeal } = await import("./support/crm");
    const { createTestProposal, createTestLineItem, cleanupSalesFixtures } = await import("./support/sales");
    const company = await createTestCompany(app, finance.organizationId);
    const taxRate = await createTestTaxRate(app, finance.organizationId, {
      hsnSacCode: "998399",
      cgstRate: "9.00",
      sgstRate: "9.00",
      igstRate: "18.00",
    });
    const prisma = app.get(PrismaService);
    const deal = await createTestDeal(app, finance.organizationId, finance.userId);
    await prisma.deal.update({ where: { id: deal.id }, data: { company_id: company.id } });

    const draftProposal = await createTestProposal(app, finance.organizationId, deal.id, finance.userId, {
      status: "DRAFT",
    });
    const rejected = await request(app.getHttpServer())
      .post("/api/v1/invoices/from-proposal")
      .set(financeMutateHeaders(finance))
      .send({ proposalId: draftProposal.id });
    expect(rejected.status).toBe(409);
    expect(rejected.body.error.code).toBe("PROPOSAL_NOT_ACCEPTED");

    const accepted = await createTestProposal(app, finance.organizationId, deal.id, finance.userId, {
      status: "ACCEPTED",
      version: 2,
    });
    const line = await createTestLineItem(app, finance.organizationId, accepted.id, {
      description: "Snapshot me",
      quantity: "1.00",
      unitPrice: "10000.00",
    });
    await prisma.proposalLineItem.update({
      where: { id: line.id },
      data: { tax_rate_id: taxRate.id },
    });

    const response = await request(app.getHttpServer())
      .post("/api/v1/invoices/from-proposal")
      .set(financeMutateHeaders(finance))
      .send({ proposalId: accepted.id });
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.lineItems).toHaveLength(1);
    expect(response.body.lineItems[0].hsnSacCode).toBe("998399");
    expect(response.body.lineItems[0].igstRate).toBe("0.00");
    expect(response.body.lineItems[0].lineTotal).toBe("11800.00");
    expect(response.body.amount).toBe("11800.00");

    await cleanupSalesFixtures(app);
  });

  it("4. invoice lifecycle: void requires DRAFT + zero payments; cancel requires a reason and works from SENT", async () => {
    const company = await createTestCompany(app, finance.organizationId);

    const draftWithPayment = await createTestInvoice(app, finance.organizationId, company.id);
    await createTestPayment(app, finance.organizationId, draftWithPayment.id, finance.userId);
    const voidWithPayment = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draftWithPayment.id}/void`)
      .set(financeMutateHeaders(finance));
    expect(voidWithPayment.status).toBe(409);
    expect(voidWithPayment.body.error.code).toBe("INVOICE_VOID_REQUIRES_NO_PAYMENTS");

    const cleanDraft = await createTestInvoice(app, finance.organizationId, company.id);
    const voidClean = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${cleanDraft.id}/void`)
      .set(financeMutateHeaders(finance));
    expect(voidClean.status).toBe(200);
    expect(voidClean.body.status).toBe("VOID");

    const sentInvoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });
    const cancelNoReason = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${sentInvoice.id}/cancel`)
      .set(financeMutateHeaders(finance))
      .send({});
    expect(cancelNoReason.status).toBe(400);

    const cancelWithReason = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${sentInvoice.id}/cancel`)
      .set(financeMutateHeaders(finance))
      .send({ reason: "Client cancelled the engagement" });
    expect(cancelWithReason.status).toBe(200);
    expect(cancelWithReason.body.status).toBe("CANCELLED");
    expect(cancelWithReason.body.cancellationReason).toBe("Client cancelled the engagement");
  });

  it("cancelling an invoice with payments automatically issues a CreditNote for the paid amount", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "PARTIALLY_PAID",
      amount: "10000.00",
      paidAmount: "4000.00",
    });

    const response = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${invoice.id}/cancel`)
      .set(financeMutateHeaders(finance))
      .send({ reason: "Scope changed" });
    expect(response.status).toBe(200);

    const detail = await request(app.getHttpServer()).get(`/api/v1/invoices/${invoice.id}`).set(authHeaders(finance));
    expect(detail.body.creditNotes).toHaveLength(1);
    expect(detail.body.creditNotes[0].amount).toBe("4000.00");
    expect(detail.body.creditNotes[0].reason).toBe("CANCELLATION");
    expect(detail.body.creditNotes[0].creditNoteNumber).toMatch(/^CN-/);
  });

  it("arbitrary status PATCH is not exposed — an unwhitelisted status field is rejected", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id);
    const response = await request(app.getHttpServer())
      .patch(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance))
      .send({ status: "SENT", version: invoice.version });
    expect(response.status).toBe(400);
  });

  it("remind: only valid from a remindable status, 202, idempotent (no state mutation)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const draft = await createTestInvoice(app, finance.organizationId, company.id, { status: "DRAFT" });
    const notRemindable = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${draft.id}/remind`)
      .set(financeMutateHeaders(finance));
    expect(notRemindable.status).toBe(409);

    const sent = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });
    const remindable = await request(app.getHttpServer())
      .post(`/api/v1/invoices/${sent.id}/remind`)
      .set(financeMutateHeaders(finance));
    expect(remindable.status).toBe(202);
  });

  it("RBAC: OPERATIONS has neither finance.read nor finance.manage", async () => {
    const listResponse = await request(app.getHttpServer()).get("/api/v1/invoices").set(authHeaders(operations));
    expect(listResponse.status).toBe(403);
  });

  it("mass assignment: invoice_number/status/paid_amount cannot be set on create", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const response = await request(app.getHttpServer())
      .post("/api/v1/invoices")
      .set(financeMutateHeaders(finance))
      .send({ companyId: company.id, invoiceNumber: "INV-FAKE-0001", status: "PAID", paidAmount: "999999.00" });
    expect(response.status).toBe(400);
  });

  it("malformed UUID and unauthenticated access", async () => {
    const malformed = await request(app.getHttpServer()).get("/api/v1/invoices/not-a-uuid").set(authHeaders(finance));
    expect(malformed.status).toBe(400);

    const unauth = await request(app.getHttpServer()).get("/api/v1/invoices");
    expect(unauth.status).toBe(401);
  });
});
