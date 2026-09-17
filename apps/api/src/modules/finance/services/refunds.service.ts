import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { PaymentMethod, PaymentStatus, Prisma, RefundStatus, type Refund } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateRefundDto, ListRefundsQueryDto } from "../dto/refund.dto";
import { deriveStatusAfterPayment } from "../policies/invoice-state-machine";
import { RazorpayService } from "./razorpay.service";

@Injectable()
export class RefundsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly razorpay: RazorpayService
  ) {}

  async list(actor: AuthenticatedUser, query: ListRefundsQueryDto): Promise<ListEnvelope<Refund>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";
    const where: Prisma.RefundWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.refund.findMany({ where, orderBy: { created_at: sortDirection }, ...offsetSkipTake(page, pageSize) }),
      this.prisma.refund.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  /**
   * `POST /refunds` — Document 5 §8.3 / §9.4. Gateway call (RAZORPAY) is
   * outside the DB transaction; payment + invoice rows are locked with
   * `FOR UPDATE` so concurrent refunds cannot overshoot the refundable
   * amount or desync `paid_amount`.
   */
  async create(actor: AuthenticatedUser, dto: CreateRefundDto): Promise<Refund> {
    const paymentPreview = await this.prisma.payment.findFirst({
      where: { id: dto.paymentId, organization_id: actor.organizationId },
    });
    if (!paymentPreview) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Payment not found." });
    }
    if (paymentPreview.status !== PaymentStatus.COMPLETED) {
      throw new ConflictException({
        code: "PAYMENT_NOT_REFUNDABLE",
        message: `A payment in status ${paymentPreview.status} cannot be refunded.`,
        details: { status: paymentPreview.status },
      });
    }

    const requestedAmount = new Prisma.Decimal(dto.amount);

    let razorpayRefundId: string | undefined;
    if (paymentPreview.method === PaymentMethod.RAZORPAY) {
      razorpayRefundId = await this.razorpay.createRefund(paymentPreview.razorpay_payment_id!, requestedAmount);
    }

    const refund = await this.prisma.$transaction(async (tx) => {
      const lockedPayments = await tx.$queryRaw<
        Array<{ id: string; amount: Prisma.Decimal; status: string; invoice_id: string }>
      >`
        SELECT id, amount, status::text AS status, invoice_id
        FROM payments
        WHERE id = ${dto.paymentId}::uuid
          AND organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;
      const payment = lockedPayments[0];
      if (!payment) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Payment not found." });
      }
      if (payment.status !== PaymentStatus.COMPLETED) {
        throw new ConflictException({
          code: "PAYMENT_NOT_REFUNDABLE",
          message: `A payment in status ${payment.status} cannot be refunded.`,
          details: { status: payment.status },
        });
      }

      const priorRefunds = await tx.refund.findMany({
        where: { payment_id: payment.id, status: { not: RefundStatus.FAILED } },
        select: { amount: true },
      });
      const alreadyRefunded = priorRefunds.reduce(
        (sum, r) => sum.plus(r.amount),
        new Prisma.Decimal(0)
      );
      const refundable = new Prisma.Decimal(payment.amount).minus(alreadyRefunded);
      if (requestedAmount.greaterThan(refundable)) {
        throw new UnprocessableEntityException({
          code: "REFUND_EXCEEDS_REFUNDABLE_AMOUNT",
          message: "This refund would exceed the amount still refundable on this payment.",
          details: { refundable: refundable.toString(), requested: dto.amount },
        });
      }

      const fullyRefunded = alreadyRefunded.plus(requestedAmount).greaterThanOrEqualTo(payment.amount);

      const created = await tx.refund.create({
        data: {
          organization_id: actor.organizationId,
          payment_id: payment.id,
          amount: requestedAmount,
          reason: dto.reason,
          status: RefundStatus.COMPLETED,
          razorpay_refund_id: razorpayRefundId,
          approved_by: actor.id,
        },
      });

      if (fullyRefunded) {
        await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REVERSED } });
      }

      // B9 H7: reverse automatic Forge Fund contribution linked to this payment.
      // Withdrawal is keyed by refund id so partial refunds remain unique under the
      // partial unique index on (org, source_type, source_id, type).
      const contribution = await tx.forgeFundEntry.findFirst({
        where: {
          organization_id: actor.organizationId,
          source_type: "payment",
          source_id: payment.id,
          type: "CONTRIBUTION",
        },
      });
      if (contribution) {
        const withdrawalAmount = new Prisma.Decimal(contribution.amount)
          .times(requestedAmount)
          .dividedBy(new Prisma.Decimal(payment.amount))
          .toDecimalPlaces(2);
        if (withdrawalAmount.greaterThan(0)) {
          await tx.forgeFundEntry.create({
            data: {
              organization_id: actor.organizationId,
              type: "WITHDRAWAL",
              amount: withdrawalAmount,
              source_type: "refund",
              source_id: created.id,
              reason: `Automatic reversal for refund ${created.id} on payment ${payment.id}`,
              approved_by: actor.id,
            },
          });
        }
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
      const newPaidAmount = new Prisma.Decimal(invoice.paid_amount).minus(requestedAmount);
      const liveStatuses = new Set(["SENT", "PARTIALLY_PAID", "PAID", "OVERDUE"]);
      await tx.invoice.update({
        where: { id: invoice.id },
        data: {
          paid_amount: newPaidAmount,
          ...(liveStatuses.has(invoice.status)
            ? { status: deriveStatusAfterPayment(newPaidAmount, new Prisma.Decimal(invoice.amount)) }
            : {}),
        },
      });

      return { created, fullyRefunded };
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.REFUND_CREATED,
      entityType: "Refund",
      entityId: refund.created.id,
      after: { paymentId: dto.paymentId, amount: dto.amount, fullyRefunded: refund.fullyRefunded },
    });

    return refund.created;
  }
}
