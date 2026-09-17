import { Prisma, TaxTreatment } from "@prisma/client";

/**
 * `Invoice.tax_treatment`: "computed at creation from org/company billing
 * state, then frozen" (Document 2). Standard Indian GST rule: same state
 * as the organization's own billing state -> intra-state -> CGST+SGST;
 * different state -> inter-state -> IGST. `EXEMPT` is a valid schema
 * value but has no computed trigger condition anywhere in Documents 1/2/5
 * — never auto-selected here; nothing in this phase can produce it (see
 * docs/IMPLEMENTATION-PHASE-B5.md open decisions).
 *
 * Requires the company to have a `billing_state` set — without one,
 * neither branch of the comparison is meaningful, and Document 2 gives no
 * fallback. Rejected explicitly by the caller (`COMPANY_BILLING_STATE_REQUIRED`)
 * rather than guessed.
 */
export function computeTaxTreatment(
  organizationBillingState: string,
  companyBillingState: string
): TaxTreatment {
  return organizationBillingState.trim().toLowerCase() === companyBillingState.trim().toLowerCase()
    ? TaxTreatment.CGST_SGST
    : TaxTreatment.IGST;
}

/**
 * TaxRate catalog rows conventionally store both legs (cgst+sgst AND igst)
 * so the same HSN/SAC works for either treatment. Invoice line snapshots
 * must zero the unused leg(s) for the invoice's frozen `tax_treatment` —
 * otherwise `computeLineTotal` would double-count (e.g. 9+9+18 = 36%).
 */
export function snapshotRatesForTreatment(
  taxTreatment: TaxTreatment,
  rates: {
    cgst_rate: Prisma.Decimal | string;
    sgst_rate: Prisma.Decimal | string;
    igst_rate: Prisma.Decimal | string;
  }
): { cgst_rate: Prisma.Decimal; sgst_rate: Prisma.Decimal; igst_rate: Prisma.Decimal } {
  const zero = new Prisma.Decimal(0);
  if (taxTreatment === TaxTreatment.EXEMPT) {
    return { cgst_rate: zero, sgst_rate: zero, igst_rate: zero };
  }
  if (taxTreatment === TaxTreatment.IGST) {
    return {
      cgst_rate: zero,
      sgst_rate: zero,
      igst_rate: new Prisma.Decimal(rates.igst_rate),
    };
  }
  return {
    cgst_rate: new Prisma.Decimal(rates.cgst_rate),
    sgst_rate: new Prisma.Decimal(rates.sgst_rate),
    igst_rate: zero,
  };
}

/**
 * `InvoiceLineItem.line_total`: "computed at creation, stored (not
 * recomputed on read)" (Document 2) — the exact arithmetic isn't spelled
 * out in Documents 1/2/5 beyond the field list, so this is the standard,
 * only-sensible reading given the schema's own fields (quantity, unit
 * price, three percentage tax rates, a total that must reflect them):
 *
 *   subtotal   = quantity * unit_price
 *   tax_amount = subtotal * (cgst_rate + sgst_rate + igst_rate) / 100
 *   line_total = subtotal + tax_amount
 *
 * Callers must pass rates already narrowed by `snapshotRatesForTreatment`
 * so unused legs are 0 — never sum a full catalog TaxRate row as-is.
 *
 * Never uses JavaScript floating-point arithmetic — every operand and the
 * result are `Prisma.Decimal` (decimal.js) throughout.
 */
export function computeLineTotal(
  quantity: Prisma.Decimal | string,
  unitPrice: Prisma.Decimal | string,
  cgstRate: Prisma.Decimal | string,
  sgstRate: Prisma.Decimal | string,
  igstRate: Prisma.Decimal | string
): Prisma.Decimal {
  const subtotal = new Prisma.Decimal(quantity).times(new Prisma.Decimal(unitPrice));
  const totalRate = new Prisma.Decimal(cgstRate).plus(sgstRate).plus(igstRate);
  const taxAmount = subtotal.times(totalRate).dividedBy(100);
  return subtotal.plus(taxAmount).toDecimalPlaces(2);
}

/** Sum of a set of already-computed `line_total` values — `Invoice.amount` ("sum of line items, computed at finalize"). */
export function sumLineTotals(lineTotals: readonly (Prisma.Decimal | string)[]): Prisma.Decimal {
  return lineTotals.reduce(
    (sum: Prisma.Decimal, value) => sum.plus(new Prisma.Decimal(value)),
    new Prisma.Decimal(0)
  );
}
