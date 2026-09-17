import type { InvoiceStatus, PaymentStatus } from "./types";

export function isDraftInvoice(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

export function canSendInvoice(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

export function canVoidInvoice(status: InvoiceStatus): boolean {
  return status === "DRAFT";
}

export function canCancelInvoice(status: InvoiceStatus): boolean {
  return status === "SENT" || status === "PARTIALLY_PAID" || status === "PAID" || status === "OVERDUE";
}

export function canRemindInvoice(status: InvoiceStatus): boolean {
  return status === "SENT" || status === "PARTIALLY_PAID" || status === "OVERDUE";
}

export function canRefundPayment(status: PaymentStatus): boolean {
  return status === "COMPLETED";
}

export function invoiceCancelBody(reason: string) {
  return { reason };
}

export function refundBody(paymentId: string, amount: string, reason: string) {
  return { paymentId, amount, reason };
}
