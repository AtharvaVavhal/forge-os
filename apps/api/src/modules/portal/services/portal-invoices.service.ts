import { Injectable, NotFoundException } from "@nestjs/common";
import { InvoiceStatus } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import {
  buildOffsetMeta,
  offsetSkipTake,
  type ListEnvelope,
  type OffsetPaginationQueryDto,
} from "../../../common/pagination/offset-pagination";
import { RazorpayOrdersService } from "../../finance/services/razorpay-orders.service";
import type { AuthenticatedPortalUser } from "../types/authenticated-portal-request.interface";

/** Client-facing invoice statuses — drafts are never shown on the portal. */
const PORTAL_INVOICE_STATUSES: InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
  InvoiceStatus.CANCELLED,
];

@Injectable()
export class PortalInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly razorpayOrders: RazorpayOrdersService
  ) {}

  async list(
    client: AuthenticatedPortalUser,
    query: OffsetPaginationQueryDto
  ): Promise<ListEnvelope<Record<string, unknown>>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const { skip, take } = offsetSkipTake(page, pageSize);

    const where = {
      organization_id: client.organizationId,
      company_id: client.companyId,
      status: { in: PORTAL_INVOICE_STATUSES },
    };

    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip,
        take,
        orderBy: { created_at: "desc" },
        select: {
          id: true,
          invoice_number: true,
          financial_year: true,
          status: true,
          tax_treatment: true,
          amount: true,
          paid_amount: true,
          due_date: true,
          sent_at: true,
          bill_to_snapshot: true,
          created_at: true,
          updated_at: true,
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return { data: rows, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(client: AuthenticatedPortalUser, id: string): Promise<Record<string, unknown>> {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id,
        organization_id: client.organizationId,
        company_id: client.companyId,
        status: { in: PORTAL_INVOICE_STATUSES },
      },
      include: {
        line_items: { orderBy: { sort_order: "asc" } },
        payments: {
          where: { status: { not: "PENDING" } },
          orderBy: { created_at: "desc" },
          select: {
            id: true,
            amount: true,
            method: true,
            status: true,
            paid_at: true,
            created_at: true,
          },
        },
      },
    });
    if (!invoice) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Invoice not found." });
    }
    return invoice;
  }

  /** Starts Razorpay checkout only — does not mark paid (Document 5 §11). */
  async pay(client: AuthenticatedPortalUser, id: string) {
    return this.razorpayOrders.createOrderForPortalInvoice({
      organizationId: client.organizationId,
      companyId: client.companyId,
      invoiceId: id,
    });
  }
}
