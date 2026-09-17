import { Injectable, NotFoundException } from "@nestjs/common";
import type { CreditNote, Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";
import { buildOffsetMeta, offsetSkipTake, type ListEnvelope } from "../../../common/pagination/offset-pagination";
import { AuditService, AUDIT_ACTIONS } from "../../shared/audit.service";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import type { CreateCreditNoteDto, ListCreditNotesQueryDto } from "../dto/credit-note.dto";
import { computeFinancialYear, SequencesService } from "./sequences.service";

const DETAIL_INCLUDE = {
  line_items: true,
  invoice: { select: { id: true, invoice_number: true } },
};

@Injectable()
export class CreditNotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sequences: SequencesService
  ) {}

  async list(actor: AuthenticatedUser, query: ListCreditNotesQueryDto): Promise<ListEnvelope<CreditNote>> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const sortDirection = (query.sort ?? "createdAt:desc").endsWith(":asc") ? "asc" : "desc";
    const where: Prisma.CreditNoteWhereInput = { organization_id: actor.organizationId };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.creditNote.findMany({
        where,
        orderBy: { created_at: sortDirection },
        include: { invoice: { select: { id: true, invoice_number: true } } },
        ...offsetSkipTake(page, pageSize),
      }),
      this.prisma.creditNote.count({ where }),
    ]);

    return { data, meta: { pagination: buildOffsetMeta(page, pageSize, total) } };
  }

  async get(actor: AuthenticatedUser, id: string): Promise<CreditNote> {
    const creditNote = await this.prisma.creditNote.findFirst({
      where: { id, organization_id: actor.organizationId },
      include: DETAIL_INCLUDE,
    });
    if (!creditNote) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Credit note not found." });
    }
    return creditNote;
  }

  /** `POST /credit-notes` — Document 5 §8.3: "claims CreditNoteSequence; lines optional" (this phase implements the documented, line-less create — matches the existing frontend contract). Tier A audit. */
  async create(actor: AuthenticatedUser, dto: CreateCreditNoteDto): Promise<CreditNote> {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: dto.invoiceId, organization_id: actor.organizationId },
    });
    if (!invoice) {
      throw new NotFoundException({ code: "NOT_FOUND", message: "Invoice not found." });
    }

    const creditNote = await this.prisma.$transaction(async (tx) => {
      const financialYear = computeFinancialYear(new Date());
      const number = await this.sequences.claimNextCreditNoteNumber(tx, actor.organizationId, financialYear);
      return tx.creditNote.create({
        data: {
          organization_id: actor.organizationId,
          credit_note_number: `CN-${financialYear}-${String(number).padStart(4, "0")}`,
          financial_year: financialYear,
          invoice_id: invoice.id,
          reason: dto.reason,
          amount: dto.amount,
          approved_by: actor.id,
        },
      });
    });

    await this.audit.record({
      organizationId: actor.organizationId,
      actorType: "USER",
      actorId: actor.id,
      action: AUDIT_ACTIONS.CREDIT_NOTE_ISSUED,
      entityType: "CreditNote",
      entityId: creditNote.id,
      after: { invoiceId: invoice.id, amount: dto.amount, reason: dto.reason },
    });

    return this.get(actor, creditNote.id);
  }
}
