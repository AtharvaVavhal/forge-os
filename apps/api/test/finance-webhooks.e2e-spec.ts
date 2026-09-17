import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./support/bootstrap";
import { cleanupTestFixtures } from "./support/fixtures";
import { loginSession, type AuthSession } from "./support/crm";
import {
  cleanupFinanceFixtures,
  createTestCompany,
  createTestInvoice,
  createTestPayment,
  signWebhookPayload,
} from "./support/finance";
import { PrismaService } from "../src/database/prisma.service";

function razorpayPayload(opts: { orderId: string; paymentId: string; amountRupees: number; status: "captured" | "failed" }) {
  return {
    entity: "event",
    event: "payment.captured",
    payload: {
      payment: {
        entity: {
          id: opts.paymentId,
          amount: Math.round(opts.amountRupees * 100),
          order_id: opts.orderId,
          status: opts.status,
        },
      },
    },
  };
}

describe("Finance — Razorpay webhook (e2e)", () => {
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

  it("22. rejects an invalid signature before any DB write", async () => {
    const body = JSON.stringify(razorpayPayload({ orderId: "order_x", paymentId: "pay_x", amountRupees: 100, status: "captured" }));
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", "0".repeat(64))
      .set("X-Razorpay-Event-Id", "evt_bad_sig")
      .send(body);
    expect(response.status).toBe(401);

    const prisma = app.get(PrismaService);
    const eventRow = await prisma.webhookEvent.findFirst({ where: { external_event_id: "evt_bad_sig" } });
    expect(eventRow).toBeNull(); // no write at all, not even a RECEIVED row
  });

  it("rejects a missing signature header", async () => {
    const body = JSON.stringify(razorpayPayload({ orderId: "order_x", paymentId: "pay_y", amountRupees: 100, status: "captured" }));
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .send(body);
    expect(response.status).toBe(401);
  });

  it("24. valid signature + known order: creates Payment, updates invoice.paid_amount/status, creates a ForgeFundEntry CONTRIBUTION — full financial idempotency chain", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, { status: "SENT", amount: "5000.00" });
    const orderId = `order_${Date.now()}`;
    const paymentId = `pay_${Date.now()}`;
    // Seed the "order created" moment: a Payment row carrying razorpay_order_id
    // with no razorpay_payment_id yet — this is what
    // RazorpayOrdersService.createOrderForInvoice's real flow would produce
    // once a payment gateway confirms attach (mirrors the local-lookup fast
    // path in RazorpayService.resolveInvoiceIdForOrder without requiring a
    // live Razorpay account in this environment — see
    // docs/IMPLEMENTATION-PHASE-B5.md).
    await createTestPayment(app, finance.organizationId, invoice.id, null, {
      status: "PENDING",
      amount: "5000.00",
      method: "RAZORPAY",
      razorpayOrderId: orderId,
    });

    const eventId = `evt_${Date.now()}`;
    const body = JSON.stringify(razorpayPayload({ orderId, paymentId, amountRupees: 5000, status: "captured" }));
    const signature = signWebhookPayload(body);

    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);
    expect(response.status).toBe(200);

    const prisma = app.get(PrismaService);
    const createdPayment = await prisma.payment.findFirst({ where: { razorpay_payment_id: paymentId } });
    expect(createdPayment).not.toBeNull();
    expect(createdPayment!.status).toBe("COMPLETED");
    expect(createdPayment!.amount.toString()).toBe("5000");

    const updatedInvoice = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updatedInvoice.paid_amount.toString()).toBe("5000");
    expect(updatedInvoice.status).toBe("PAID");

    const contribution = await prisma.forgeFundEntry.findFirst({
      where: { source_type: "payment", source_id: createdPayment!.id },
    });
    expect(contribution).not.toBeNull();
    expect(contribution!.type).toBe("CONTRIBUTION");
    expect(contribution!.amount.toString()).toBe("5000");

    const eventRow = await prisma.webhookEvent.findFirst({ where: { external_event_id: eventId } });
    expect(eventRow!.status).toBe("PROCESSED");

    // 23. Duplicate delivery of the *same* event_id -> 200, idempotent no-op.
    const duplicateResponse = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);
    expect(duplicateResponse.status).toBe(200);

    const paymentCountAfterDuplicate = await prisma.payment.count({ where: { razorpay_payment_id: paymentId } });
    expect(paymentCountAfterDuplicate).toBe(1); // no double-effect

    const invoiceAfterDuplicate = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(invoiceAfterDuplicate.paid_amount.toString()).toBe("5000"); // not doubled to 10000

    const contributionCount = await prisma.forgeFundEntry.count({
      where: { source_type: "payment", source_id: createdPayment!.id },
    });
    expect(contributionCount).toBe(1); // partial unique index prevents a double contribution

    // Different event_id, same razorpay_payment_id — must not double paid_amount / Fund.
    const secondEventId = `evt_replay_${Date.now()}`;
    const secondResponse = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", secondEventId)
      .send(body);
    expect(secondResponse.status).toBe(200);
    const invoiceAfterSecondEvent = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(invoiceAfterSecondEvent.paid_amount.toFixed(2)).toBe("5000.00");
    expect(
      await prisma.forgeFundEntry.count({ where: { source_type: "payment", source_id: createdPayment!.id } })
    ).toBe(1);
    expect(await prisma.payment.count({ where: { invoice_id: invoice.id } })).toBe(1);
  });

  it("webhook capture against a CANCELLED invoice does not resurrect status", async () => {
    const company = await createTestCompany(app, finance.organizationId);
    const invoice = await createTestInvoice(app, finance.organizationId, company.id, {
      status: "CANCELLED",
      amount: "2000.00",
      paidAmount: "0.00",
    });
    const orderId = `order_cancelled_${Date.now()}`;
    const paymentId = `pay_cancelled_${Date.now()}`;
    await createTestPayment(app, finance.organizationId, invoice.id, null, {
      status: "PENDING",
      amount: "2000.00",
      method: "RAZORPAY",
      razorpayOrderId: orderId,
    });

    const body = JSON.stringify(razorpayPayload({ orderId, paymentId, amountRupees: 2000, status: "captured" }));
    const signature = signWebhookPayload(body);
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", `evt_cancelled_${Date.now()}`)
      .send(body);
    expect(response.status).toBe(200);

    const prisma = app.get(PrismaService);
    const updated = await prisma.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    expect(updated.status).toBe("CANCELLED");
    expect(updated.paid_amount.toFixed(2)).toBe("2000.00");
  });

  it("a webhook for an unresolvable order is stored RECEIVED without any financial mutation (must not crash)", async () => {
    const eventId = `evt_unresolvable_${Date.now()}`;
    const body = JSON.stringify(
      razorpayPayload({ orderId: `order_never_created_${Date.now()}`, paymentId: `pay_${Date.now()}`, amountRupees: 100, status: "captured" })
    );
    const signature = signWebhookPayload(body);

    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);
    expect(response.status).toBe(200);

    const prisma = app.get(PrismaService);
    const eventRow = await prisma.webhookEvent.findFirst({ where: { external_event_id: eventId } });
    expect(eventRow).not.toBeNull();
    expect(eventRow!.status).toBe("RECEIVED"); // never advanced to PROCESSED
  });

  it("an unknown event type is acknowledged and stored without a finance mutation, does not crash", async () => {
    const eventId = `evt_unknown_type_${Date.now()}`;
    const body = JSON.stringify({ entity: "event", event: "refund.processed", payload: {} });
    const signature = signWebhookPayload(body);

    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", eventId)
      .send(body);
    expect(response.status).toBe(200);

    const prisma = app.get(PrismaService);
    const eventRow = await prisma.webhookEvent.findFirst({ where: { external_event_id: eventId } });
    expect(eventRow!.event_type).toBe("refund.processed");
  });

  it("webhook route requires no authentication cookie/session at all (HMAC is the auth)", async () => {
    const body = JSON.stringify(razorpayPayload({ orderId: "order_noauth", paymentId: "pay_noauth", amountRupees: 1, status: "captured" }));
    const signature = signWebhookPayload(body);
    const response = await request(app.getHttpServer())
      .post("/api/v1/webhooks/razorpay")
      .set("Content-Type", "application/json")
      .set("X-Razorpay-Signature", signature)
      .set("X-Razorpay-Event-Id", `evt_noauth_${Date.now()}`)
      .send(body);
    // No cookies were ever set on this request — a 401 here would mean
    // JwtAuthGuard incorrectly ran against a route that must be @Public().
    expect(response.status).not.toBe(401);
  });
});
