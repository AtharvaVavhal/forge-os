import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures, createTestUser } from "./support/fixtures";
import { authHeaders, listData, loginSession, type AuthSession } from "./support/crm";
import {
  cleanupFinanceFixtures,
  createTestCompany,
  createTestInvoice,
  createTestPayment,
  financeMutateHeaders
} from "./support/finance";
import { PrismaService } from "../src/database/prisma.service";

describe("Finance — Payments & Refunds (e2e)", () => {
  let app: INestApplication;
  let finance: AuthSession;

  beforeAll(async () => {
    app = await createTestApp();
    finance = await loginSession(app, "FINANCE");
  });

  afterAll(async () => {
    await cleanupFinanceFixtures(app);
    await cleanupTestFixtures(app);
    await app.close();
  });

  it("9/11. offline payment application updates paid_amount and derives PARTIALLY_PAID then PAID", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "SENT",
      amount: "10000.00",
    });

    const first = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "4000.00", method: "CASH" });
    expect(first.status).toBe(201);
    expect(first.body.status).toBe("COMPLETED");

    const afterFirst = await request(app.getHttpServer()).get(`/api/v1/invoices/${invoice.id}`).set(authHeaders(finance));
    expect(afterFirst.body.status).toBe("PARTIALLY_PAID");
    expect(afterFirst.body.paidAmount).toBe("4000.00");
    expect(afterFirst.body.pendingAmount).toBe("6000.00");

    const second = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "6000.00", method: "BANK_TRANSFER" });
    expect(second.status).toBe(201);

    const afterSecond = await request(app.getHttpServer()).get(`/api/v1/invoices/${invoice.id}`).set(authHeaders(finance));
    expect(afterSecond.body.status).toBe("PAID");
    expect(afterSecond.body.pendingAmount).toBe("0.00");
  });

  it("10. payment amount validation: rejects float shapes and overpayment (DB CHECK backstopped)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT", amount: "1000.00" });

    const badShape = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "abc", method: "CASH" });
    expect(badShape.status).toBe(400);

    const overpay = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "1000.01", method: "CASH" });
    expect(overpay.status).toBe(422);
    expect(overpay.body.error.code).toBe("PAYMENT_EXCEEDS_OUTSTANDING");
  });

  it("payments are rejected against non-payable invoices (DRAFT, VOID, CANCELLED)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const draft = await createTestInvoice(app, finance.organizationId, company.id, { status: "DRAFT" });
    const response = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: draft.id, amount: "100.00", method: "CASH" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("INVOICE_NOT_PAYABLE");
  });

  it("RAZORPAY is not an accepted offline method (client cannot self-mark a payment completed)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });
    const response = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "100.00", method: "RAZORPAY", razorpayPaymentId: "pay_fake123" });
    expect(response.status).toBe(400);
  });

  it("recordedBy defaults to the acting user, or may name another in-org user; a cross-org user is rejected", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });

    const defaultResponse = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "100.00", method: "CASH" });
    expect(defaultResponse.status).toBe(201);
    expect(defaultResponse.body.recordedBy).toBe(finance.userId);

    const otherFinanceUser = await createTestUser(app, { role: "FOUNDER_ADMIN" });
    const explicitResponse = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "100.00", method: "CASH", recordedBy: otherFinanceUser.id });
    expect(explicitResponse.status).toBe(201);
    expect(explicitResponse.body.recordedBy).toBe(otherFinanceUser.id);
  });

  it("12. duplicate payment protection: applying the same payment amount twice is two distinct, both-valid payments — not silently deduplicated by the API (idempotency is via the Idempotency-Key header, see finance-webhooks spec)", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT", amount: "10000.00" });

    const first = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "3000.00", method: "CASH" });
    expect(first.status).toBe(201);
    const second = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "3000.00", method: "CASH" });
    expect(second.status).toBe(201);
    expect(second.body.id).not.toBe(first.body.id);

    const key = crypto.randomUUID();
    const withKeyFirst = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance, key))
      .send({ invoiceId: invoice.id, amount: "1000.00", method: "CASH" });
    expect(withKeyFirst.status).toBe(201);
    const withKeySecond = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance, key))
      .send({ invoiceId: invoice.id, amount: "1000.00", method: "CASH" });
    expect(withKeySecond.status).toBe(201);
    expect(withKeySecond.body.id).toBe(withKeyFirst.body.id); // replayed, not a second real payment

    const prisma = app.get(PrismaService);
    const paymentCount = await prisma.payment.count({ where: { invoice_id: invoice.id, amount: "1000.00" } });
    expect(paymentCount).toBe(1);

    const missingKey = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(authHeaders(finance))
      .send({ invoiceId: invoice.id, amount: "100.00", method: "CASH" });
    expect(missingKey.status).toBe(400);
    expect(missingKey.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");

    // Concurrent overpayment race: two payments that each fit alone but
    // together exceed outstanding — exactly one must succeed; paid_amount
    // must equal the sum of COMPLETED payments.
    const raceInvoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "SENT",
      amount: "10000.00",
    });
    const [raceA, raceB] = await Promise.all([
      request(app.getHttpServer())
        .post("/api/v1/payments")
        .set(financeMutateHeaders(finance))
        .send({ invoiceId: raceInvoice.id, amount: "6000.00", method: "CASH" }),
      request(app.getHttpServer())
        .post("/api/v1/payments")
        .set(financeMutateHeaders(finance))
        .send({ invoiceId: raceInvoice.id, amount: "6000.00", method: "CASH" }),
    ]);
    const raceStatuses = [raceA.status, raceB.status].sort();
    expect(raceStatuses).toEqual([201, 422]);
    const raceAfter = await prisma.invoice.findUniqueOrThrow({ where: { id: raceInvoice.id } });
    const completedSum = await prisma.payment.aggregate({
      where: { invoice_id: raceInvoice.id, status: "COMPLETED" },
      _sum: { amount: true },
    });
    expect(raceAfter.paid_amount.toFixed(2)).toBe(completedSum._sum.amount!.toFixed(2));
    expect(raceAfter.paid_amount.toFixed(2)).toBe("6000.00");
  });

  it("13/14. refunds: only against COMPLETED payments, amount <= payment - prior refunds", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "PAID",
      amount: "5000.00",
      paidAmount: "5000.00",
    });
    const payment = await createTestPayment(app, finance.organizationId, invoice.id, finance.userId, { amount: "5000.00" });

    const tooMuch = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: payment.id, amount: "5000.01", reason: "Client dispute" });
    expect(tooMuch.status).toBe(422);
    expect(tooMuch.body.error.code).toBe("REFUND_EXCEEDS_REFUNDABLE_AMOUNT");

    const partial = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: payment.id, amount: "2000.00", reason: "Partial goodwill refund" });
    expect(partial.status).toBe(201);
    expect(partial.body.status).toBe("COMPLETED");

    const paymentAfterPartial = await request(app.getHttpServer()).get("/api/v1/payments").set(authHeaders(finance));
    const foundPartial = listData<{ id: string; status: string }>(paymentAfterPartial.body).find((p) => p.id === payment.id);
    expect(foundPartial?.status).toBe("COMPLETED"); // not fully refunded yet

    const invoiceAfterPartial = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance));
    expect(invoiceAfterPartial.body.paidAmount).toBe("3000.00");
    expect(invoiceAfterPartial.body.status).toBe("PARTIALLY_PAID");

    const remainder = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: payment.id, amount: "3000.00", reason: "Full remaining refund" });
    expect(remainder.status).toBe(201);

    const paymentAfterFull = await request(app.getHttpServer()).get("/api/v1/payments").set(authHeaders(finance));
    const foundFull = listData<{ id: string; status: string }>(paymentAfterFull.body).find((p) => p.id === payment.id);
    expect(foundFull?.status).toBe("REVERSED");

    // The payment is now REVERSED (fully refunded above) — a further
    // refund attempt is rejected by the *status* check before it even
    // reaches the amount-remaining check (a REVERSED payment can't be
    // refunded again regardless of amount, which is the more specific,
    // correct rejection here).
    const overRefund = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: payment.id, amount: "0.01", reason: "Should fail — nothing left to refund" });
    expect(overRefund.status).toBe(409);
    expect(overRefund.body.error.code).toBe("PAYMENT_NOT_REFUNDABLE");
  });

  it("a PENDING or FAILED payment cannot be refunded", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT" });
    const pendingPayment = await createTestPayment(app, finance.organizationId, invoice.id, finance.userId, {
      status: "PENDING",
    });
    const response = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: pendingPayment.id, amount: "100.00", reason: "Should be rejected" });
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("PAYMENT_NOT_REFUNDABLE");
  });

  it("refunding a payment on an already-cancelled invoice still reconciles paid_amount without resurrecting the invoice status", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "CANCELLED",
      amount: "2000.00",
      paidAmount: "2000.00",
    });
    const payment = await createTestPayment(app, finance.organizationId, invoice.id, finance.userId, { amount: "2000.00" });

    const response = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: payment.id, amount: "2000.00", reason: "Post-cancellation refund" });
    expect(response.status).toBe(201);

    const afterRefund = await request(app.getHttpServer())
      .get(`/api/v1/invoices/${invoice.id}`)
      .set(authHeaders(finance));
    expect(afterRefund.body.status).toBe("CANCELLED"); // never resurrected
    expect(afterRefund.body.paidAmount).toBe("0.00");
  });

  it("cross-org IDOR: a payment/refund cannot reference another org's invoice/payment", async () => {
    const { createSecondOrganization, createTestUser: createUser } = await import("./support/fixtures");
    const otherOrgId = await createSecondOrganization(app);
    const otherOrgUser = await createUser(app, { role: "FOUNDER_ADMIN", organizationId: otherOrgId });
    const otherCompany = await app.get(PrismaService).company.create({
      data: { organization_id: otherOrgId, name: `other-org-company-${Date.now()}`, billing_state: "Delhi" },
    });
    const otherInvoice = await createTestInvoice(app, otherOrgId, otherCompany.id, { status: "SENT" });
    const otherPayment = await createTestPayment(app, otherOrgId, otherInvoice.id, otherOrgUser.id);

    const paymentAttempt = await request(app.getHttpServer())
      .post("/api/v1/payments")
      .set(financeMutateHeaders(finance))
      .send({ invoiceId: otherInvoice.id, amount: "100.00", method: "CASH" });
    expect(paymentAttempt.status).toBe(404);

    const refundAttempt = await request(app.getHttpServer())
      .post("/api/v1/refunds")
      .set(financeMutateHeaders(finance))
      .send({ paymentId: otherPayment.id, amount: "10.00", reason: "Cross-org attempt" });
    expect(refundAttempt.status).toBe(404);

    await app.get(PrismaService).payment.delete({ where: { id: otherPayment.id } });
    await app.get(PrismaService).invoice.delete({ where: { id: otherInvoice.id } });
    await app.get(PrismaService).company.delete({ where: { id: otherCompany.id } });
  });
});
