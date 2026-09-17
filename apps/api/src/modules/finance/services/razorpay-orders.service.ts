import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { isInvoicePayable } from "../policies/invoice-state-machine";
import { RazorpayService, type RazorpayOrder } from "./razorpay.service";

/**
 * `POST /payments/razorpay/orders` — Document 5 §8.2 / §9.1:
 * 1. Validate invoice (in-org, payable).
 * 2. Create Razorpay order via HTTP **outside** any DB transaction.
 * 3. Write a PENDING Payment carrying `razorpay_order_id` (the designed
 *    "DB write of pending payment" after the external call).
 *
 * The webhook later attaches `razorpay_payment_id` to this same row.
 */
@Injectable()
export class RazorpayOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpay: RazorpayService
  ) {}

  async createOrderForInvoice(
    actor: AuthenticatedUser,
    invoiceId: string
  ): Promise<RazorpayOrder & { paymentId: string }> {
    return this.createOrderForScopedInvoice({
      organizationId: actor.organizationId,
      invoiceId,
    });
  }

  /**
   * Portal pay path (Document 5 §11) — same Razorpay order flow as internal,
   * but additionally requires `company_id` match so a ClientUser cannot
   * start checkout on another company's invoice.
   */
  async createOrderForPortalInvoice(params: {
    organizationId: string;
    companyId: string;
    invoiceId: string;
  }): Promise<RazorpayOrder & { paymentId: string }> {
    return this.createOrderForScopedInvoice({
      organizationId: params.organizationId,
      companyId: params.companyId,
      invoiceId: params.invoiceId,
    });
  }

  private async createOrderForScopedInvoice(params: {
    organizationId: string;
    companyId?: string;
    invoiceId: string;
  }): Promise<RazorpayOrder & { paymentId: string }> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: params.invoiceId,
        organization_id: params.organizationId,
        ...(params.companyId ? { company_id: params.companyId } : {}),
      },
    });
    if (!invoice) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Invoice not found." });
    }
    if (!isInvoicePayable(invoice.status)) {
      throw new ConflictException({
        code: "INVOICE_NOT_PAYABLE",
        message: `An invoice in status ${invoice.status} cannot accept a payment.`,
        details: { status: invoice.status },
      });
    }

    const outstanding = new Prisma.Decimal(invoice.amount).minus(new Prisma.Decimal(invoice.paid_amount));
    if (outstanding.lessThanOrEqualTo(0)) {
      throw new ConflictException({
        code: "INVOICE_ALREADY_PAID",
        message: "This invoice has no outstanding amount to collect.",
      });
    }

    // B9 H6: reuse an existing open Razorpay checkout instead of creating N orders.
    const existingPending = await this.prisma.payment.findFirst({
      where: {
        organization_id: params.organizationId,
        invoice_id: invoice.id,
        method: PaymentMethod.RAZORPAY,
        status: PaymentStatus.PENDING,
      },
      orderBy: { created_at: "desc" },
    });
    if (existingPending?.razorpay_order_id) {
      const order = this.razorpay.viewExistingOrder(
        existingPending.razorpay_order_id,
        existingPending.amount
      );
      return { ...order, paymentId: existingPending.id };
    }

    // External HTTP first — Document 5 §13: no Razorpay I/O inside a Prisma txn.
    const order = await this.razorpay.createOrder(outstanding, invoice.id);

    const pending = await this.prisma.payment.create({
      data: {
        organization_id: params.organizationId,
        invoice_id: invoice.id,
        amount: outstanding,
        method: PaymentMethod.RAZORPAY,
        status: PaymentStatus.PENDING,
        razorpay_order_id: order.orderId,
      },
    });

    return { ...order, paymentId: pending.id };
  }
}
