import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { PaymentMethod, PaymentStatus, Prisma, WebhookSource, WebhookStatus } from "@prisma/client";
import type { AppConfig } from "../../../config/configuration";
import { PrismaService } from "../../../database/prisma.service";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import { deriveStatusAfterPayment, isInvoicePayable } from "../policies/invoice-state-machine";

const RAZORPAY_API_BASE = "https://api.razorpay.com/v1";

/** Razorpay amounts are integer paise (smallest currency unit) — never rupees. */
function toPaise(rupees: Prisma.Decimal): number {
  return rupees.times(100).toDecimalPlaces(0).toNumber();
}
function fromPaise(paise: number): Prisma.Decimal {
  return new Prisma.Decimal(paise).dividedBy(100).toDecimalPlaces(2);
}

export interface RazorpayOrder {
  orderId: string;
  amount: string;
  currency: string;
  keyId: string;
}

@Injectable()
export class RazorpayService {
  private readonly logger = new Logger(RazorpayService.name);

  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  private get razorpayConfig() {
    return this.config.get("razorpay", { infer: true });
  }

  /**
   * `POST /payments/razorpay/orders` — Document 5 §9.1: "creates Razorpay
   * order (HTTP to Razorpay outside DB transaction)." Real Razorpay
   * credentials aren't required to boot — returns 503 if unconfigured.
   */
  async createOrder(amount: Prisma.Decimal, receipt: string): Promise<RazorpayOrder> {
    const { keyId, keySecret, configured } = this.razorpayConfig;
    if (!configured || !keyId || !keySecret) {
      throw new ServiceUnavailableException({
        code: "RAZORPAY_NOT_CONFIGURED",
        message: "Razorpay is not configured in this environment.",
      });
    }

    const response = await fetch(`${RAZORPAY_API_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({ amount: toPaise(amount), currency: "INR", receipt }),
    });
    if (!response.ok) {
      this.logger.error(`Razorpay order creation failed: ${response.status}`);
      throw new ServiceUnavailableException({
        code: "RAZORPAY_ORDER_FAILED",
        message: "Could not create a Razorpay order.",
      });
    }
    const body = (await response.json()) as { id: string; amount: number; currency: string };
    return { orderId: body.id, amount: fromPaise(body.amount).toString(), currency: body.currency, keyId };
  }

  /** Re-expose an already-created PENDING order without calling Razorpay again (B9 H6). */
  viewExistingOrder(orderId: string, amount: Prisma.Decimal): RazorpayOrder {
    const { keyId, configured } = this.razorpayConfig;
    if (!configured || !keyId) {
      throw new ServiceUnavailableException({
        code: "RAZORPAY_NOT_CONFIGURED",
        message: "Razorpay is not configured in this environment.",
      });
    }
    return {
      orderId,
      amount: amount.toFixed(2),
      currency: "INR",
      keyId,
    };
  }

  /** Document 5 §9.4: "Razorpay refund API call outside DB transaction." */
  async createRefund(razorpayPaymentId: string, amount: Prisma.Decimal): Promise<string> {
    const { keyId, keySecret, configured } = this.razorpayConfig;
    if (!configured || !keyId || !keySecret) {
      throw new ServiceUnavailableException({
        code: "RAZORPAY_NOT_CONFIGURED",
        message: "Razorpay is not configured in this environment.",
      });
    }

    const response = await fetch(`${RAZORPAY_API_BASE}/payments/${razorpayPaymentId}/refund`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({ amount: toPaise(amount) }),
    });
    if (!response.ok) {
      this.logger.error(`Razorpay refund failed: ${response.status} ${await response.text()}`);
      throw new ServiceUnavailableException({
        code: "RAZORPAY_REFUND_FAILED",
        message: "Could not create a Razorpay refund.",
      });
    }
    const body = (await response.json()) as { id: string };
    return body.id;
  }

  /**
   * HMAC-SHA256 of the raw body, hex digest, constant-time compared
   * against `X-Razorpay-Signature` (Document 5 §9.2 / Document 6 §12).
   */
  verifySignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
    const { webhookSecret, webhookConfigured } = this.razorpayConfig;
    if (!webhookConfigured || !webhookSecret || !signatureHeader) return false;

    const expected = createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(expected, "utf8");
    const actualBuf = Buffer.from(signatureHeader, "utf8");
    if (expectedBuf.length !== actualBuf.length) return false;
    return timingSafeEqual(expectedBuf, actualBuf);
  }

  /**
   * `POST /webhooks/razorpay` — Document 5 §9.2 / Document 6 §12 mandatory order.
   *
   * Financial effects apply only when a Payment transitions **into**
   * COMPLETED. A second delivery with a different `external_event_id` for
   * an already-completed `razorpay_payment_id` is a no-op for money/Fund.
   * Terminal invoices (CANCELLED/VOID/DRAFT) never have their status
   * resurrected; `paid_amount` is still updated when money actually lands
   * on a live payable invoice only.
   */
  async handleWebhook(
    organizationId: string,
    eventId: string,
    eventType: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    const paymentEntity = extractPaymentEntity(payload);

    const invoiceId = paymentEntity
      ? await this.resolveInvoiceIdForOrder(organizationId, paymentEntity.order_id)
      : null;

    let appliedFinance = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        try {
          await tx.webhookEvent.create({
            data: {
              organization_id: organizationId,
              source: WebhookSource.RAZORPAY,
              external_event_id: eventId,
              event_type: eventType,
              payload: payload as Prisma.InputJsonValue,
              status: WebhookStatus.RECEIVED,
            },
          });
        } catch (error) {
          // Duplicate external_event_id — Document 6 §12: 200 no-op.
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            throw new DuplicateWebhookDeliveryError();
          }
          throw error;
        }

        if (!paymentEntity || !invoiceId) {
          return;
        }

        const amount = fromPaise(paymentEntity.amount);
        const razorpayStatus = paymentEntity.status;

        // Only definitive capture completes money; intermediate states
        // (authorized, etc.) are stored without finance mutation.
        if (razorpayStatus !== "captured" && razorpayStatus !== "failed") {
          return;
        }

        const paymentStatus =
          razorpayStatus === "captured" ? PaymentStatus.COMPLETED : PaymentStatus.FAILED;

        const existingByPaymentId = await tx.payment.findFirst({
          where: {
            organization_id: organizationId,
            razorpay_payment_id: paymentEntity.id,
          },
        });
        const existingByOrderId = await tx.payment.findFirst({
          where: {
            organization_id: organizationId,
            razorpay_order_id: paymentEntity.order_id,
            razorpay_payment_id: null,
          },
        });

        const priorStatus = existingByPaymentId?.status ?? existingByOrderId?.status ?? null;

        if (priorStatus === PaymentStatus.COMPLETED && paymentStatus === PaymentStatus.COMPLETED) {
          await tx.webhookEvent.update({
            where: {
              organization_id_source_external_event_id: {
                organization_id: organizationId,
                source: WebhookSource.RAZORPAY,
                external_event_id: eventId,
              },
            },
            data: { status: WebhookStatus.PROCESSED, processed_at: new Date() },
          });
          return;
        }

        let payment;
        if (existingByPaymentId) {
          payment = await tx.payment.update({
            where: { id: existingByPaymentId.id },
            data: {
              status: paymentStatus,
              amount,
              paid_at: paymentStatus === PaymentStatus.COMPLETED ? new Date() : undefined,
            },
          });
        } else if (existingByOrderId) {
          payment = await tx.payment.update({
            where: { id: existingByOrderId.id },
            data: {
              status: paymentStatus,
              amount,
              razorpay_payment_id: paymentEntity.id,
              paid_at: paymentStatus === PaymentStatus.COMPLETED ? new Date() : undefined,
            },
          });
        } else {
          payment = await tx.payment.create({
            data: {
              organization_id: organizationId,
              invoice_id: invoiceId,
              amount,
              method: PaymentMethod.RAZORPAY,
              status: paymentStatus,
              razorpay_payment_id: paymentEntity.id,
              razorpay_order_id: paymentEntity.order_id,
              paid_at: paymentStatus === PaymentStatus.COMPLETED ? new Date() : undefined,
            },
          });
        }

        const newlyCompleted =
          paymentStatus === PaymentStatus.COMPLETED && priorStatus !== PaymentStatus.COMPLETED;

        if (!newlyCompleted) {
          await tx.webhookEvent.update({
            where: {
              organization_id_source_external_event_id: {
                organization_id: organizationId,
                source: WebhookSource.RAZORPAY,
                external_event_id: eventId,
              },
            },
            data: { status: WebhookStatus.PROCESSED, processed_at: new Date() },
          });
          return;
        }

        const lockedInvoices = await tx.$queryRaw<
          Array<{ id: string; amount: Prisma.Decimal; paid_amount: Prisma.Decimal; status: string }>
        >`
          SELECT id, amount, paid_amount, status::text AS status
          FROM invoices
          WHERE id = ${payment.invoice_id}::uuid
          FOR UPDATE
        `;
        const invoice = lockedInvoices[0]!;
        const newPaidAmount = new Prisma.Decimal(invoice.paid_amount).plus(amount);

        if (newPaidAmount.greaterThan(new Prisma.Decimal(invoice.amount))) {
          // Do not silent-cap — leave Payment COMPLETED for recon, mark
          // webhook FAILED so ops can investigate (Document 6: alert, no
          // silent auto-heal). Roll back paid_amount write by not writing.
          await tx.webhookEvent.update({
            where: {
              organization_id_source_external_event_id: {
                organization_id: organizationId,
                source: WebhookSource.RAZORPAY,
                external_event_id: eventId,
              },
            },
            data: {
              status: WebhookStatus.FAILED,
              error: "Payment amount would exceed invoice outstanding; paid_amount not updated.",
              processed_at: new Date(),
            },
          });
          return;
        }

        const invoiceUpdate: Prisma.InvoiceUpdateInput = {
          paid_amount: newPaidAmount,
        };
        // Never resurrect CANCELLED/VOID/DRAFT via webhook — mirror refunds.
        if (isInvoicePayable(invoice.status as Parameters<typeof isInvoicePayable>[0]) || invoice.status === "PAID") {
          invoiceUpdate.status = deriveStatusAfterPayment(
            newPaidAmount,
            new Prisma.Decimal(invoice.amount)
          );
        }
        await tx.invoice.update({ where: { id: invoice.id }, data: invoiceUpdate });

        try {
          await tx.forgeFundEntry.create({
            data: {
              organization_id: organizationId,
              type: "CONTRIBUTION",
              amount,
              source_type: "payment",
              source_id: payment.id,
              reason: `Automatic contribution from Razorpay payment ${payment.id}`,
              approved_by: await this.resolveSystemApproverUserId(tx, organizationId),
            },
          });
        } catch (error) {
          // Partial unique on (org, source_type, source_id, type) — a
          // different event_id for the same payment must not double-contribute.
          if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
            throw error;
          }
        }

        await tx.webhookEvent.update({
          where: {
            organization_id_source_external_event_id: {
              organization_id: organizationId,
              source: WebhookSource.RAZORPAY,
              external_event_id: eventId,
            },
          },
          data: { status: WebhookStatus.PROCESSED, processed_at: new Date() },
        });

        appliedFinance = true;
      });
    } catch (error) {
      if (error instanceof DuplicateWebhookDeliveryError) {
        this.logger.log(`Duplicate Razorpay webhook delivery ignored (event_id=${eventId}).`);
        return;
      }
      throw error;
    }

    if (appliedFinance) {
      await this.audit.record({
        organizationId,
        actorType: "SYSTEM",
        actorId: null,
        action: AUDIT_ACTIONS.PAYMENT_COMPLETED_WEBHOOK,
        entityType: "WebhookEvent",
        entityId: eventId.length === 36 ? eventId : NIL_UUID,
        after: { eventType, paymentId: paymentEntity?.id },
      });
    }
  }

  private async resolveInvoiceIdForOrder(organizationId: string, orderId: string): Promise<string | null> {
    const existingByOrder = await this.prisma.payment.findFirst({
      where: { organization_id: organizationId, razorpay_order_id: orderId },
      select: { invoice_id: true },
    });
    if (existingByOrder) return existingByOrder.invoice_id;

    const { keyId, keySecret, configured } = this.razorpayConfig;
    if (!configured || !keyId || !keySecret) return null;

    try {
      const response = await fetch(`${RAZORPAY_API_BASE}/orders/${orderId}`, {
        headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString("base64")}` },
      });
      if (!response.ok) return null;
      const body = (await response.json()) as { receipt?: string };
      if (!body.receipt) return null;

      const invoice = await this.prisma.invoice.findFirst({
        where: { id: body.receipt, organization_id: organizationId },
        select: { id: true },
      });
      return invoice?.id ?? null;
    } catch (error) {
      this.logger.error(
        `Failed to resolve invoice for Razorpay order ${orderId}`,
        error instanceof Error ? error.stack : String(error)
      );
      return null;
    }
  }

  private async resolveSystemApproverUserId(tx: Prisma.TransactionClient, organizationId: string): Promise<string> {
    const founder = await tx.user.findFirst({
      where: { organization_id: organizationId, role: "FOUNDER_ADMIN", active: true },
      orderBy: { created_at: "asc" },
      select: { id: true },
    });
    if (!founder) {
      throw new Error(
        `No active FOUNDER_ADMIN found for organization ${organizationId} to attribute a system Forge Fund entry to.`
      );
    }
    return founder.id;
  }
}

class DuplicateWebhookDeliveryError extends Error {
  constructor() {
    super("Duplicate webhook delivery");
  }
}

const NIL_UUID = "00000000-0000-0000-0000-000000000000";

interface PaymentEntity {
  id: string;
  amount: number;
  order_id: string;
  status: string;
}

function extractPaymentEntity(payload: Record<string, unknown>): PaymentEntity | null {
  const payloadField = payload.payload;
  if (!isRecord(payloadField)) return null;
  const paymentField = payloadField.payment;
  if (!isRecord(paymentField)) return null;
  const entity = paymentField.entity;
  if (!isRecord(entity)) return null;
  const { id, amount, order_id, status } = entity;
  if (
    typeof id !== "string" ||
    typeof amount !== "number" ||
    typeof order_id !== "string" ||
    typeof status !== "string"
  ) {
    return null;
  }
  return { id, amount, order_id, status };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
