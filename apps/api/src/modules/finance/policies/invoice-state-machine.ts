import { InvoiceStatus, Prisma } from "@prisma/client";

/**
 * Document 5 §8.1/§12.5, §13: two distinct kinds of Invoice state change —
 *
 * 1. **Explicit action endpoints** (client-driven): `/send` (DRAFT->SENT),
 *    `/void` (DRAFT->VOID, only with zero payments), `/cancel` (any of
 *    SENT/PARTIALLY_PAID/PAID/OVERDUE -> CANCELLED, reason required).
 *    "Invoice: Draft editable only; Void only Draft with no payments;
 *    Cancel + CreditNote when money moved."
 *
 * 2. **Payment-driven derivation** (system-driven, not a client action):
 *    applying a Payment recomputes `paid_amount` and derives SENT ->
 *    PARTIALLY_PAID -> PAID automatically — see `deriveStatusAfterPayment`.
 *
 * `OVERDUE` is a valid enum value with no transition *into* it implemented
 * in this phase — reaching it would require a scheduled job comparing
 * `due_date` against `now()` (Document 5 doesn't specify one, and no
 * scheduler infrastructure exists — "no generic automation" per the task's
 * own scope boundary). Documented as an open item, not silently ignored.
 */
const CANCELLABLE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.PAID,
  InvoiceStatus.OVERDUE,
];

/** Statuses a Payment may be applied against — an unsent, void, or cancelled invoice cannot receive one. */
const PAYABLE_STATUSES: readonly InvoiceStatus[] = [
  InvoiceStatus.SENT,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

export function isDraftInvoice(status: InvoiceStatus): boolean {
  return status === InvoiceStatus.DRAFT;
}

export function isInvoiceCancellable(status: InvoiceStatus): boolean {
  return CANCELLABLE_STATUSES.includes(status);
}

export function isInvoicePayable(status: InvoiceStatus): boolean {
  return PAYABLE_STATUSES.includes(status);
}

/**
 * Pure function: given the invoice's current status and its (already
 * updated) `paid_amount`/`amount`, what status should it now have?
 * `PAID`/`PARTIALLY_PAID` are the only statuses a payment can newly
 * produce — never called with a non-payable current status (callers
 * guard with `isInvoicePayable` first).
 */
export function deriveStatusAfterPayment(
  paidAmount: Prisma.Decimal,
  amount: Prisma.Decimal
): InvoiceStatus {
  if (paidAmount.greaterThanOrEqualTo(amount)) return InvoiceStatus.PAID;
  if (paidAmount.greaterThan(0)) return InvoiceStatus.PARTIALLY_PAID;
  return InvoiceStatus.SENT;
}
