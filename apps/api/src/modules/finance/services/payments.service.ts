import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { PaymentStatus, Prisma, type Payment } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreatePaymentDto, ListPaymentsQueryDto } from "../dto/payment.dto";
import { deriveStatusAfterPayment, isInvoicePayable } from "../policies/invoice-state-machine";
import { assertUserInOrg } from "./scope-guards";

const DETAIL_INCLUDE = {
  refunds: { orderBy: { created_at: "asc" as const } },
  invoice: { select: { id: true, invoice_number: true } },
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async list(actor: AuthenticatedUser, query: ListPaymentsQueryDto): Promise<ListEnvelope<Payment>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";
    const where: Prisma.PaymentWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        orderBy: { created_at: sortDirection },
        include: { invoice: { select: { id: true, invoice_number: true } } },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.payment.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Payment> {
    const payment = await this.prisma.payment.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!payment) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Payment not found." });
    }
    return payment;
  }

  /**
   * `POST /payments` — Document 5 §8.2: "manual/offline only; recorded_by
   * required; method != RAZORPAY" (enforced by the DTO's own enum, which
   * never includes RAZORPAY — see payment.dto.ts). Applies the payment to
   * the invoice transactionally under `SELECT … FOR UPDATE` so concurrent
   * offline payments cannot both pass an outstanding check against a
   * stale `paid_amount`. Tier A audit.
   */
  async create(actor: AuthenticatedUser, dto: CreatePaymentDto): Promise<Payment> {
    const recordedBy = dto.recordedBy ?? actor.id;
    await assertUserInOrg(this.prisma, recordedBy, actor.organizationId);

    const amount = new Prisma.Decimal(dto.amount);

    const payment = await this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        Array<{
          id: string;
          amount: Prisma.Decimal;
          paid_amount: Prisma.Decimal;
          status: string;
        }>
      >`
        SELECT id, amount, paid_amount, status::text AS status
        FROM invoices
        WHERE id = ${dto.invoiceId}::uuid
          AND organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;
      const invoice = locked[0];
      if (!invoice) {
        throw new NotFoundException({ code: "NOT_FOUND", message: "Invoice not found." });
      }
      if (!isInvoicePayable(invoice.status as Parameters<typeof isInvoicePayable>[0])) {
        throw new ConflictException({
          code: "INVOICE_NOT_PAYABLE",
          message: `An invoice in status ${invoice.status} cannot receive a payment.`,
          details: { status: invoice.status },
        });
      }

      const newPaidAmount = new Prisma.Decimal(invoice.paid_amount).plus(amount);
      if (newPaidAmount.greaterThan(new Prisma.Decimal(invoice.amount))) {
        throw new UnprocessableEntityException({
          code: "PAYMENT_EXCEEDS_OUTSTANDING",
          message: "This payment would exceed the invoice's outstanding amount.",
          details: {
            invoiceAmount: invoice.amount.toString(),
            alreadyPaid: invoice.paid_amount.toString(),
            attempted: amount.toString(),
          },
        });
      }

      const nextStatus = deriveStatusAfterPayment(newPaidAmount, new Prisma.Decimal(invoice.amount));

      const created = await tx.payment.create({
        data: {
          organization_id: actor.organizationId,
          invoice_id: invoice.id,
          amount,
          method: dto.method,
          status: PaymentStatus.COMPLETED,
          reference_note: dto.referenceNote,
          recorded_by: recordedBy,
          paid_at: dto.paidAt ? new Date(dto.paidAt) : new Date(),
        },
      });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { paid_amount: newPaidAmount, status: nextStatus },
      });
      return created;
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.PAYMENT_RECORDED,
      entityType: "Payment",
      entityId: payment.id,
      after: { invoiceId: dto.invoiceId, amount: dto.amount, method: dto.method },
    });

    return this.get(actor, payment.id);
  }

  /** Used only by RefundsService/RazorpayService, which already hold a validated, in-org Payment row. */
  async getRawById(id: string) {
    return this.prisma.payment.findUniqueOrThrow({ where: { id } });
  }
}
