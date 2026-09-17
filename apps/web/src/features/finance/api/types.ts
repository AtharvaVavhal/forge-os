export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
  "CANCELLED",
] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TAX_TREATMENTS = ["CGST_SGST", "IGST", "EXEMPT"] as const;
export type TaxTreatment = (typeof TAX_TREATMENTS)[number];

export const PAYMENT_STATUSES = ["PENDING", "COMPLETED", "FAILED", "REVERSED"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["RAZORPAY", "CASH", "BANK_TRANSFER", "CHEQUE"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const OFFLINE_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "CHEQUE"] as const;
export type OfflinePaymentMethod = (typeof OFFLINE_PAYMENT_METHODS)[number];

export const REFUND_STATUSES = ["PENDING", "COMPLETED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const CREDIT_NOTE_REASONS = [
  "SCOPE_REDUCTION",
  "PRICING_ERROR",
  "CANCELLATION",
  "GOODWILL",
  "OTHER",
] as const;
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];

export const FORGE_FUND_ENTRY_TYPES = ["CONTRIBUTION", "WITHDRAWAL", "ALLOCATION"] as const;
export type ForgeFundEntryType = (typeof FORGE_FUND_ENTRY_TYPES)[number];

export interface NamedRef {
  id: string;
  name: string;
}

export interface BillToSnapshot {
  name: string | null;
  gstin: string | null;
  billingState: string | null;
  billingAddress: string | null;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  hsnSacCode: string | null;
  quantity: string | null;
  unitPrice: string | null;
  cgstRate: string | null;
  sgstRate: string | null;
  igstRate: string | null;
  lineTotal: string | null;
  sortOrder: number;
}

export interface Invoice {
  id: string;
  organizationId: string | null;
  invoiceNumber: string | null;
  financialYear: string | null;
  projectId: string | null;
  companyId: string;
  company: NamedRef | null;
  status: InvoiceStatus;
  taxTreatment: TaxTreatment | null;
  billTo: BillToSnapshot | null;
  amount: string | null;
  paidAmount: string | null;
  pendingAmount: string | null;
  dueDate: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  version: number;
  createdAt: string | null;
  updatedAt: string | null;
  lineItems: InvoiceLineItem[];
  payments: Payment[];
  creditNotes: CreditNote[];
}

export interface Payment {
  id: string;
  organizationId: string | null;
  invoiceId: string;
  invoice: NamedRef | null;
  amount: string | null;
  method: PaymentMethod;
  status: PaymentStatus;
  razorpayPaymentId: string | null;
  razorpayOrderId: string | null;
  referenceNote: string | null;
  recordedBy: string | null;
  paidAt: string | null;
  version: number;
  createdAt: string | null;
  refunds: Refund[];
}

export interface Refund {
  id: string;
  paymentId: string;
  amount: string | null;
  reason: string;
  status: RefundStatus;
  razorpayRefundId: string | null;
  approvedBy: string | null;
  createdAt: string | null;
}

export interface CreditNoteLineItem {
  id: string;
  description: string;
  amount: string | null;
}

export interface CreditNote {
  id: string;
  organizationId: string | null;
  creditNoteNumber: string | null;
  financialYear: string | null;
  invoiceId: string;
  invoice: NamedRef | null;
  reason: CreditNoteReason;
  amount: string | null;
  issuedAt: string | null;
  approvedBy: string | null;
  createdAt: string | null;
  lineItems: CreditNoteLineItem[];
}

export interface Expense {
  id: string;
  organizationId: string | null;
  projectId: string | null;
  project: NamedRef | null;
  description: string;
  amount: string | null;
  category: string;
  incurredAt: string | null;
  recordedBy: string | null;
  createdAt: string | null;
}

export interface ForgeFundEntry {
  id: string;
  type: ForgeFundEntryType;
  amount: string | null;
  reason: string;
  sourceType: string | null;
  sourceId: string | null;
  approvedBy: string | null;
  createdAt: string | null;
}

export interface OffsetList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
}
