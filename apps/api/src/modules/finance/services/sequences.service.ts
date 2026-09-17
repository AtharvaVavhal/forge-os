import { Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../../database/prisma.service";

type TxClient = Prisma.TransactionClient;

/**
 * Financial-year-scoped, gapless sequence claiming for both
 * `InvoiceSequence` and `CreditNoteSequence` — Document 5 §13/§19:
 * "Invoice numbers | SELECT … FOR UPDATE on InvoiceSequence"; "Credit
 * note numbers | SELECT … FOR UPDATE on CreditNoteSequence."
 *
 * Prisma has no `.findFirst({ lock: 'FOR UPDATE' })` API, so the row lock
 * is a raw `SELECT ... FOR UPDATE` inside the caller's transaction — the
 * upsert beforehand (outside the lock, but its own single statement is
 * atomic at the Postgres level via `ON CONFLICT`) only ensures a row
 * exists for a financial year seen for the first time; the actual
 * concurrency guarantee is the row lock, held until the transaction
 * commits, blocking any concurrent claim for the *same* (org, financial
 * year) from reading the row until this one is done. Two different
 * financial years, or two different organizations, never contend.
 */
@Injectable()
export class SequencesService {
  constructor(private readonly prisma: PrismaService) {}

  async claimNextInvoiceNumber(tx: TxClient, organizationId: string, financialYear: string): Promise<number> {
    await tx.invoiceSequence.upsert({
      where: { organization_id_financial_year: { organization_id: organizationId, financial_year: financialYear } },
      create: { organization_id: organizationId, financial_year: financialYear, last_number: 0 },
      update: {},
    });

    const rows = await tx.$queryRaw<Array<{ last_number: number }>>`
      SELECT last_number FROM invoice_sequences
      WHERE organization_id = ${organizationId}::uuid AND financial_year = ${financialYear}
      FOR UPDATE
    `;
    const nextNumber = (rows[0]?.last_number ?? 0) + 1;

    await tx.invoiceSequence.update({
      where: { organization_id_financial_year: { organization_id: organizationId, financial_year: financialYear } },
      data: { last_number: nextNumber },
    });

    return nextNumber;
  }

  async claimNextCreditNoteNumber(tx: TxClient, organizationId: string, financialYear: string): Promise<number> {
    await tx.creditNoteSequence.upsert({
      where: { organization_id_financial_year: { organization_id: organizationId, financial_year: financialYear } },
      create: { organization_id: organizationId, financial_year: financialYear, last_number: 0 },
      update: {},
    });

    const rows = await tx.$queryRaw<Array<{ last_number: number }>>`
      SELECT last_number FROM credit_note_sequences
      WHERE organization_id = ${organizationId}::uuid AND financial_year = ${financialYear}
      FOR UPDATE
    `;
    const nextNumber = (rows[0]?.last_number ?? 0) + 1;

    await tx.creditNoteSequence.update({
      where: { organization_id_financial_year: { organization_id: organizationId, financial_year: financialYear } },
      data: { last_number: nextNumber },
    });

    return nextNumber;
  }

  async listInvoiceSequences(organizationId: string) {
    return this.prisma.invoiceSequence.findMany({
      where: { organization_id: organizationId },
      orderBy: { financial_year: "desc" },
    });
  }

  async listCreditNoteSequences(organizationId: string) {
    return this.prisma.creditNoteSequence.findMany({
      where: { organization_id: organizationId },
      orderBy: { financial_year: "desc" },
    });
  }
}

/**
 * Indian financial year: April 1 - March 31, conventionally written
 * "2025-26" for the year starting April 2025. Not spelled out verbatim in
 * Documents 1/2/5 beyond "financial_year: String" — this is the standard,
 * only-sensible convention for an India-based studio (Document 1: FORGE
 * is Pune-based), not an invented format.
 */
export function computeFinancialYear(date: Date): string {
  const month = date.getUTCMonth(); // 0-indexed; 3 = April
  const startYear = month >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, "0");
  return `${startYear}-${endYearShort}`;
}
