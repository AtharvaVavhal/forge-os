import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { InvoiceStatus, Prisma, ProposalStatus, type Invoice } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type {
  CancelInvoiceDto,
  CreateInvoiceDto,
  CreateInvoiceFromProposalDto,
  ListInvoicesQueryDto,
  ReplaceInvoiceLineItemsDto,
  UpdateInvoiceDto,
} from "../dto/invoice.dto";
import {
  computeLineTotal,
  computeTaxTreatment,
  snapshotRatesForTreatment,
  sumLineTotals,
} from "../policies/invoice-money";
import { isDraftInvoice, isInvoiceCancellable } from "../policies/invoice-state-machine";
import { computeFinancialYear, SequencesService } from "./sequences.service";
import { assertCompanyInOrg, assertProjectInOrg } from "./scope-guards";

const DETAIL_INCLUDE = {
  line_items: { orderBy: { sort_order: "asc" as const } },
  company: { select: { id: true, name: true } },
  payments: { include: { refunds: true }, orderBy: { created_at: "asc" as const } },
  credit_notes: { include: { line_items: true }, orderBy: { created_at: "asc" as const } },
};

/**
 * `invoice_number`/`financial_year` are NOT NULL and jointly unique per
 * org (`@@unique([organization_id, financial_year, invoice_number])`) —
 * a DRAFT invoice has neither a real number nor a real financial year
 * yet (both are only assigned at `/send`, via `InvoiceSequence`), but the
 * columns can't be empty/duplicate across drafts in the same org. A
 * per-row random suffix keeps every draft's placeholder unique without
 * ever colliding with a real, sequence-assigned `INV-<FY>-<n>` number.
 */
function draftInvoicePlaceholder(): { invoice_number: string; financial_year: string } {
  return { invoice_number: `DRAFT-${randomUUID()}`, financial_year: "DRAFT" };
}

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequencesService
  ) {}

  async list(actor: AuthenticatedUser, query: ListInvoicesQueryDto): Promise<ListEnvelope<Invoice>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";

    const where: Prisma.InvoiceWhereInput = {
      organization_id: actor.organizationId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where,
        orderBy: { created_at: sortDirection },
        include: { company: { select: { id: true, name: true } } },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.invoice.count({ where }),
    ]);

    return {
      data: data.map((invoice) => this.withPendingAmount(invoice)),
      meta: { pagination: buildOffsetMeta(page, pageSize, total) },
    };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!invoice) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Invoice not found." });
    }
    return this.withPendingAmount(invoice);
  }

  /** Internal — no org-scope re-check (caller already resolved the row); used by services in the same module that already hold a validated invoice. */
  private async getRawById(id: string): Promise<Invoice> {
    const invoice = await this.prisma.invoice.findUniqueOrThrow({ where: { id } });
    return invoice;
  }

  /** Document 5 §8.1: "Create draft." No audit column. */
  async create(actor: AuthenticatedUser, dto: CreateInvoiceDto): Promise<Invoice> {
    const company = await assertCompanyInOrg(this.prisma, dto.companyId, actor.organizationId);
    if (dto.projectId) await assertProjectInOrg(this.prisma, dto.projectId, actor.organizationId);

    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { billing_state: true },
    });
    if (!company.billing_state) {
      throw new UnprocessableEntityException({
        code: "COMPANY_BILLING_STATE_REQUIRED",
        message: "This company has no billing state set — required to determine CGST/SGST vs IGST.",
      });
    }
    const taxTreatment = computeTaxTreatment(organization.billing_state, company.billing_state);

    const invoice = await this.prisma.invoice.create({
      data: {
        organization_id: actor.organizationId,
        company_id: dto.companyId,
        project_id: dto.projectId,
        status: InvoiceStatus.DRAFT,
        tax_treatment: taxTreatment,
        ...draftInvoicePlaceholder(),
        bill_to_snapshot: {},
        amount: "0.00",
        due_date: dto.dueDate ? new Date(dto.dueDate) : undefined,
      },
      include: DETAIL_INCLUDE,
    });
    return this.withPendingAmount(invoice);
  }

  /**
   * `POST /invoices/from-proposal` — Document 5 §8.1: "copies snapshot
   * lines from accepted proposal; no live FK." Requires the source
   * Proposal to be ACCEPTED (the only state Document 5 treats as ready to
   * invoice) and every one of its line items to carry a `taxRateId` —
   * `InvoiceLineItem.hsn_sac_code` is required (NOT NULL) and
   * `ProposalLineItem` has no `hsn_sac_code` of its own, only an optional
   * `tax_rate_id`; without one there is no source for the required HSN/SAC
   * code, and this rejects explicitly (`422`) rather than inventing a
   * placeholder value that would corrupt real tax documentation.
   */
  async createFromProposal(actor: AuthenticatedUser, dto: CreateInvoiceFromProposalDto): Promise<Invoice> {
    const proposal = await this.prisma.proposal.findFirst({
      where: { id: dto.proposalId, organization_id: actor.organizationId },
      include: { line_items: { include: { tax_rate: true }, orderBy: { sort_order: "asc" } }, deal: true },
    });
    if (!proposal) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Proposal not found." });
    }
    if (proposal.status !== ProposalStatus.ACCEPTED) {
      throw new ConflictException({
        code: "PROPOSAL_NOT_ACCEPTED",
        message: "Only an accepted proposal can be converted to an invoice.",
        details: { status: proposal.status },
      });
    }
    if (!proposal.deal.company_id) {
      throw new UnprocessableEntityException({
        code: "DEAL_COMPANY_REQUIRED",
        message: "This proposal's deal has no company — required to create an invoice.",
      });
    }
    const missingTaxRate = proposal.line_items.find((line) => !line.tax_rate);
    if (missingTaxRate) {
      throw new UnprocessableEntityException({
        code: "PROPOSAL_LINE_ITEM_MISSING_TAX_RATE",
        message: "Every proposal line item must reference a tax rate before it can become an invoice.",
        details: { lineItemId: missingTaxRate.id },
      });
    }

    const company = await assertCompanyInOrg(this.prisma, proposal.deal.company_id, actor.organizationId);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: actor.organizationId },
      select: { billing_state: true },
    });
    if (!company.billing_state) {
      throw new UnprocessableEntityException({
        code: "COMPANY_BILLING_STATE_REQUIRED",
        message: "This company has no billing state set — required to determine CGST/SGST vs IGST.",
      });
    }
    const taxTreatment = computeTaxTreatment(organization.billing_state, company.billing_state);

    const lineInputs = proposal.line_items.map((line) => {
      const rate = line.tax_rate!;
      const snapshotted = snapshotRatesForTreatment(taxTreatment, rate);
      const lineTotal = computeLineTotal(
        line.quantity,
        line.unit_price,
        snapshotted.cgst_rate,
        snapshotted.sgst_rate,
        snapshotted.igst_rate
      );
      return {
        description: line.description,
        hsn_sac_code: rate.hsn_sac_code,
        quantity: line.quantity,
        unit_price: line.unit_price,
        cgst_rate: snapshotted.cgst_rate,
        sgst_rate: snapshotted.sgst_rate,
        igst_rate: snapshotted.igst_rate,
        line_total: lineTotal,
        sort_order: line.sort_order,
      };
    });
    const amount = sumLineTotals(lineInputs.map((l) => l.line_total));

    const invoice = await this.prisma.$transaction(async (tx) => {
      const created = await tx.invoice.create({
        data: {
          organization_id: actor.organizationId,
          company_id: company.id,
          status: InvoiceStatus.DRAFT,
          tax_treatment: taxTreatment,
          ...draftInvoicePlaceholder(),
          bill_to_snapshot: {},
          amount,
        },
      });
      await tx.invoiceLineItem.createMany({
        data: lineInputs.map((line) => ({ ...line, organization_id: actor.organizationId, invoice_id: created.id })),
      });
      return created;
    });

    return this.get(actor, invoice.id);
  }

  /**
   * B8 DealWon consumer — create a DRAFT invoice from the accepted proposal
   * (Document 5 §13). Idempotent: if a DRAFT already exists for this project
   * linked to the same company, skip. Does not require an AuthenticatedUser
   * (system/outbox path).
   */
  async createDraftFromAcceptedProposalForDealWon(params: {
    organizationId: string;
    proposalId: string;
    projectId: string;
    companyId: string;
  }): Promise<Invoice | null> {
    const existing = await this.prisma.invoice.findFirst({
      where: {
        organization_id: params.organizationId,
        project_id: params.projectId,
        company_id: params.companyId,
        status: InvoiceStatus.DRAFT,
      },
    });
    if (existing) {
      return existing;
    }

    const proposal = await this.prisma.proposal.findFirst({
      where: { id: params.proposalId, organization_id: params.organizationId },
      include: { line_items: { include: { tax_rate: true }, orderBy: { sort_order: "asc" } }, deal: true },
    });
    if (!proposal || proposal.status !== ProposalStatus.ACCEPTED) {
      throw new ConflictException({
        code: "PROPOSAL_NOT_ACCEPTED",
        message: "Only an accepted proposal can be converted to an invoice.",
      });
    }
    if (proposal.deal.company_id !== params.companyId) {
      throw new UnprocessableEntityException({
        code: "DEAL_COMPANY_MISMATCH",
        message: "Accepted proposal company does not match DealWon payload.",
      });
    }

    const missingTaxRate = proposal.line_items.find((line) => !line.tax_rate);
    if (missingTaxRate) {
      throw new UnprocessableEntityException({
        code: "PROPOSAL_LINE_ITEM_MISSING_TAX_RATE",
        message: "Every proposal line item must reference a tax rate before it can become an invoice.",
        details: { lineItemId: missingTaxRate.id },
      });
    }

    const company = await assertCompanyInOrg(this.prisma, params.companyId, params.organizationId);
    const organization = await this.prisma.organization.findUniqueOrThrow({
      where: { id: params.organizationId },
      select: { billing_state: true },
    });
    if (!company.billing_state) {
      throw new UnprocessableEntityException({
        code: "COMPANY_BILLING_STATE_REQUIRED",
        message: "This company has no billing state set — required to determine CGST/SGST vs IGST.",
      });
    }
    await assertProjectInOrg(this.prisma, params.projectId, params.organizationId);

    const taxTreatment = computeTaxTreatment(organization.billing_state, company.billing_state);
    const lineInputs = proposal.line_items.map((line) => {
      const rate = line.tax_rate!;
      const snapshotted = snapshotRatesForTreatment(taxTreatment, rate);
      const lineTotal = computeLineTotal(
        line.quantity,
        line.unit_price,
        snapshotted.cgst_rate,
        snapshotted.sgst_rate,
        snapshotted.igst_rate
      );
      return {
        description: line.description,
        hsn_sac_code: rate.hsn_sac_code,
        quantity: line.quantity,
        unit_price: line.unit_price,
        cgst_rate: snapshotted.cgst_rate,
        sgst_rate: snapshotted.sgst_rate,
        igst_rate: snapshotted.igst_rate,
        line_total: lineTotal,
        sort_order: line.sort_order,
      };
    });
    const amount = sumLineTotals(lineInputs.map((l) => l.line_total));

    return this.prisma.$transaction(async (tx) => {
      // Re-check inside txn for concurrent consumers.
      const raced = await tx.invoice.findFirst({
        where: {
          organization_id: params.organizationId,
          project_id: params.projectId,
          status: InvoiceStatus.DRAFT,
        },
      });
      if (raced) return raced;

      const created = await tx.invoice.create({
        data: {
          organization_id: params.organizationId,
          company_id: company.id,
          project_id: params.projectId,
          status: InvoiceStatus.DRAFT,
          tax_treatment: taxTreatment,
          ...draftInvoicePlaceholder(),
          bill_to_snapshot: {},
          amount,
        },
      });
      await tx.invoiceLineItem.createMany({
        data: lineInputs.map((line) => ({
          ...line,
          organization_id: params.organizationId,
          invoice_id: created.id,
        })),
      });
      return created;
    });
  }

  /** `PATCH /invoices/:id` — DRAFT only; `version` optimistic lock (Document 5 §8.1). */
  async update(actor: AuthenticatedUser, id: string, dto: UpdateInvoiceDto): Promise<Invoice> {
    const invoice = await this.get(actor, id);
    this.assertDraft(invoice);

    const result = await this.prisma.invoice.updateMany({
      where: { id: invoice.id, organization_id: actor.organizationId, version: dto.version },
      data: {
        ...(dto.dueDate !== undefined ? { due_date: new Date(dto.dueDate) } : {}),
        version: { increment: 1 },
      },
    });
    if (result.count !== 1) {
      throw new ConflictException({
        code: "INVOICE_VERSION_CONFLICT",
        message: "This invoice was modified by someone else — reload and try again.",
      });
    }

    return this.get(actor, invoice.id);
  }

  /** `PUT /invoices/:id/line-items` — full replace, DRAFT only, atomic; each line's tax rate is looked up by HSN/SAC and copied (snapshotted), never a live FK. */
  async replaceLineItems(actor: AuthenticatedUser, id: string, dto: ReplaceInvoiceLineItemsDto): Promise<Invoice> {
    const invoice = await this.get(actor, id);
    this.assertDraft(invoice);

    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const lineInputs = [];
      for (const line of dto.lines) {
        const taxRate = await tx.taxRate.findFirst({
          where: {
            organization_id: actor.organizationId,
            hsn_sac_code: line.hsnSacCode,
            effective_from: { lte: now },
            OR: [{ effective_to: null }, { effective_to: { gte: now } }],
          },
          orderBy: { effective_from: "desc" },
        });
        // B9 M5: unknown HSN/SAC must not silently zero tax.
        if (!taxRate) {
          throw new UnprocessableEntityException({
            code: "TAX_RATE_NOT_FOUND",
            message: `No active tax rate found for HSN/SAC code "${line.hsnSacCode}".`,
            details: { hsnSacCode: line.hsnSacCode },
          });
        }
        const snapshotted = snapshotRatesForTreatment(invoice.tax_treatment, {
          cgst_rate: taxRate.cgst_rate,
          sgst_rate: taxRate.sgst_rate,
          igst_rate: taxRate.igst_rate,
        });
        lineInputs.push({
          organization_id: actor.organizationId,
          invoice_id: invoice.id,
          description: line.description,
          hsn_sac_code: line.hsnSacCode,
          quantity: line.quantity,
          unit_price: line.unitPrice,
          cgst_rate: snapshotted.cgst_rate,
          sgst_rate: snapshotted.sgst_rate,
          igst_rate: snapshotted.igst_rate,
          line_total: computeLineTotal(
            line.quantity,
            line.unitPrice,
            snapshotted.cgst_rate,
            snapshotted.sgst_rate,
            snapshotted.igst_rate
          ),
          sort_order: line.sortOrder ?? dto.lines.indexOf(line),
        });
      }

      await tx.invoiceLineItem.deleteMany({ where: { invoice_id: invoice.id } });
      await tx.invoiceLineItem.createMany({ data: lineInputs });
      await tx.invoice.update({
        where: { id: invoice.id },
        data: { amount: sumLineTotals(lineInputs.map((l) => l.line_total)) },
      });
    });

    return this.get(actor, invoice.id);
  }

  /**
   * `POST /invoices/:id/send` — Document 5 §8.1/§13: "claims InvoiceSequence
   * FOR UPDATE, freezes bill_to_snapshot + lines, SENT." Tier A audit.
   */
  async send(actor: AuthenticatedUser, id: string): Promise<Invoice> {
    const invoice = await this.get(actor, id);
    this.assertDraft(invoice);

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: invoice.company_id } });
    const financialYear = computeFinancialYear(new Date());

    const updated = await this.prisma.$transaction(async (tx) => {
      // Lock the draft row first so a concurrent /send waits here rather
      // than both claiming InvoiceSequence numbers (gapless FY requirement).
      const locked = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status::text AS status
        FROM invoices
        WHERE id = ${invoice.id}::uuid
          AND organization_id = ${actor.organizationId}::uuid
        FOR UPDATE
      `;
      if (!locked[0] || locked[0].status !== InvoiceStatus.DRAFT) {
        throw new ConflictException({
          code: "INVOICE_NOT_DRAFT",
          message: "This invoice is no longer a draft and cannot be edited this way.",
        });
      }

      const number = await this.sequences.claimNextInvoiceNumber(tx, actor.organizationId, financialYear);
      const invoiceNumber = `INV-${financialYear}-${String(number).padStart(4, "0")}`;

      const lines = await tx.invoiceLineItem.findMany({ where: { invoice_id: invoice.id } });
      const amount = sumLineTotals(lines.map((l) => l.line_total));

      return tx.invoice.update({
        where: { id: invoice.id },
        data: {
          status: InvoiceStatus.SENT,
          invoice_number: invoiceNumber,
          financial_year: financialYear,
          amount,
          sent_at: new Date(),
          bill_to_snapshot: {
            name: company.name,
            gstin: company.gstin,
            billingState: company.billing_state,
            billingAddress: company.billing_address,
          },
        },
        include: DETAIL_INCLUDE,
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.INVOICE_SENT,
      entityType: "Invoice",
      entityId: invoice.id,
      before: { status: invoice.status },
      after: { status: InvoiceStatus.SENT, invoiceNumber: updated.invoice_number },
    });

    return this.withPendingAmount(updated);
  }

  /** `POST /invoices/:id/void` — DRAFT only, and only with zero payments. Tier A audit. */
  async void(actor: AuthenticatedUser, id: string): Promise<Invoice> {
    const invoice = await this.get(actor, id);
    this.assertDraft(invoice);

    const paymentCount = await this.prisma.payment.count({ where: { invoice_id: invoice.id } });
    if (paymentCount > 0) {
      throw new ConflictException({
        code: "INVOICE_VOID_REQUIRES_NO_PAYMENTS",
        message: "This invoice has payments recorded against it and cannot be voided — cancel it instead.",
      });
    }

    const updated = await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { status: InvoiceStatus.VOID },
      include: DETAIL_INCLUDE,
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.INVOICE_VOIDED,
      entityType: "Invoice",
      entityId: invoice.id,
      before: { status: invoice.status },
      after: { status: InvoiceStatus.VOID },
    });

    return this.withPendingAmount(updated);
  }

  /**
   * `POST /invoices/:id/cancel` — Document 5 §8.1: "Reason required;
   * CreditNote if payments exist." When money has moved, cancellation
   * automatically issues a CreditNote for the paid amount (its own
   * financial-year sequence claim, same transaction) — GST documentation
   * requires a credit note for money already invoiced/paid, not a silent
   * status flip. Tier A audit.
   */
  async cancel(actor: AuthenticatedUser, id: string, dto: CancelInvoiceDto): Promise<Invoice> {
    const invoice = await this.get(actor, id);
    if (!isInvoiceCancellable(invoice.status)) {
      throw new ConflictException({
        code: "INVOICE_NOT_CANCELLABLE",
        message: `An invoice in status ${invoice.status} cannot be cancelled.`,
        details: { status: invoice.status },
      });
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED, cancelled_at: new Date(), cancellation_reason: dto.reason },
      });

      const paidAmount = new Prisma.Decimal(invoice.paid_amount);
      if (paidAmount.greaterThan(0)) {
        const financialYear = computeFinancialYear(new Date());
        const number = await this.sequences.claimNextCreditNoteNumber(tx, actor.organizationId, financialYear);
        await tx.creditNote.create({
          data: {
            organization_id: actor.organizationId,
            credit_note_number: `CN-${financialYear}-${String(number).padStart(4, "0")}`,
            financial_year: financialYear,
            invoice_id: invoice.id,
            reason: "CANCELLATION",
            amount: paidAmount,
            approved_by: actor.id,
          },
        });
      }

      return cancelled;
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.INVOICE_CANCELLED,
      entityType: "Invoice",
      entityId: invoice.id,
      before: { status: invoice.status },
      after: { status: InvoiceStatus.CANCELLED, reason: dto.reason },
    });

    return this.get(actor, updated.id);
  }

  /**
   * `POST /invoices/:id/remind` — Document 5: "Outbox notification," 202,
   * no audit column. No Notifications/DomainEvent consumer module exists
   * in this phase (out of B5's scope) — matching B2/B3's established
   * precedent of not writing an outbox event with no consumer to read it,
   * this validates the invoice is in a reminder-eligible state and
   * returns 202 with no further side effect. See
   * docs/IMPLEMENTATION-PHASE-B5.md open decisions.
   */
  async remind(actor: AuthenticatedUser, id: string): Promise<void> {
    const invoice = await this.get(actor, id);
    const remindable: InvoiceStatus[] = [InvoiceStatus.SENT, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];
    if (!remindable.includes(invoice.status)) {
      throw new ConflictException({
        code: "INVOICE_NOT_REMINDABLE",
        message: `An invoice in status ${invoice.status} cannot be reminded.`,
        details: { status: invoice.status },
      });
    }
  }

  /** Used by PaymentsService/RazorpayService after applying a payment — re-derives `paid_amount`-dependent fields without re-running org scoping (caller already holds a validated invoice). */
  async reloadAfterPaymentApplied(id: string): Promise<Invoice> {
    return this.withPendingAmount(await this.getRawById(id));
  }

  private assertDraft(invoice: Invoice): void {
    if (!isDraftInvoice(invoice.status)) {
      throw new ConflictException({
        code: "INVOICE_NOT_DRAFT",
        message: "This invoice is no longer a draft and cannot be edited this way.",
        details: { status: invoice.status },
      });
    }
  }

  /** `pending_amount = amount - paid_amount` (Document 5 §8.1: "computed, not stored"). */
  private withPendingAmount<T extends Invoice>(invoice: T): T & { pending_amount: Prisma.Decimal } {
    return {
      ...invoice,
      pending_amount: new Prisma.Decimal(invoice.amount).minus(new Prisma.Decimal(invoice.paid_amount)),
    };
  }
}
