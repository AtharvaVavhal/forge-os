import {
  asInt,
  asIsoDate,
  asMoneyString,
  asString,
  isRecord,
  parseListEnvelope,
  readField,
  unwrapData,
  type ParsedPagination,
} from "@/lib/api/parse-json";
import {
  CREDIT_NOTE_REASONS,
  FORGE_FUND_ENTRY_TYPES,
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  REFUND_STATUSES,
  TAX_TREATMENTS,
  type BillToSnapshot,
  type CreditNote,
  type CreditNoteLineItem,
  type Expense,
  type ForgeFundEntry,
  type Invoice,
  type InvoiceLineItem,
  type OffsetList,
  type Payment,
  type Refund,
  type TaxRate,
} from "./types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseNamedRef(value: unknown): { id: string; name: string } | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name =
    asString(value.name) ??
    asString(value.title) ??
    asString(readField(value, "invoiceNumber", "invoice_number"));
  if (!id || !name) return null;
  return { id, name };
}

function parseArray<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseItem).filter((item): item is T => item !== null);
}

export function parseBillToSnapshot(value: unknown): BillToSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    name: asString(value.name) ?? asString(value.companyName) ?? asString(value.company_name) ?? null,
    gstin: asString(value.gstin) ?? asString(value.GSTIN) ?? null,
    billingState:
      asString(readField(value, "billingState", "billing_state")) ?? asString(value.state) ?? null,
    billingAddress:
      asString(readField(value, "billingAddress", "billing_address")) ??
      asString(value.address) ??
      null,
  };
}

export function parseInvoiceLineItem(value: unknown): InvoiceLineItem | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const id = asString(node.id);
  const description = asString(node.description);
  if (!id || !description) return null;
  return {
    id,
    description,
    hsnSacCode: asString(readField(node, "hsnSacCode", "hsn_sac_code")) ?? null,
    quantity: asMoneyString(node.quantity),
    unitPrice: asMoneyString(readField(node, "unitPrice", "unit_price")),
    cgstRate: asMoneyString(readField(node, "cgstRate", "cgst_rate")),
    sgstRate: asMoneyString(readField(node, "sgstRate", "sgst_rate")),
    igstRate: asMoneyString(readField(node, "igstRate", "igst_rate")),
    lineTotal: asMoneyString(readField(node, "lineTotal", "line_total")),
    sortOrder: asInt(readField(node, "sortOrder", "sort_order")) ?? 0,
  };
}

export function parseRefund(value: unknown): Refund | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const paymentId = asString(readField(node, "paymentId", "payment_id"));
  const reason = asString(node.reason);
  const status = inSet(node.status, REFUND_STATUSES);
  if (!id || !paymentId || !reason || !status) return null;
  return {
    id,
    paymentId,
    amount: asMoneyString(node.amount),
    reason,
    status,
    razorpayRefundId: asString(readField(node, "razorpayRefundId", "razorpay_refund_id")) ?? null,
    approvedBy: asString(readField(node, "approvedBy", "approved_by")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parsePayment(value: unknown): Payment | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const invoiceId = asString(readField(node, "invoiceId", "invoice_id"));
  const method = inSet(node.method, PAYMENT_METHODS);
  const status = inSet(node.status, PAYMENT_STATUSES);
  if (!id || !invoiceId || !method || !status) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    invoiceId,
    invoice: parseNamedRef(node.invoice),
    amount: asMoneyString(node.amount),
    method,
    status,
    razorpayPaymentId: asString(readField(node, "razorpayPaymentId", "razorpay_payment_id")) ?? null,
    razorpayOrderId: asString(readField(node, "razorpayOrderId", "razorpay_order_id")) ?? null,
    referenceNote: asString(readField(node, "referenceNote", "reference_note")) ?? null,
    recordedBy: asString(readField(node, "recordedBy", "recorded_by")) ?? null,
    paidAt: asIsoDate(readField(node, "paidAt", "paid_at")),
    version: asInt(node.version) ?? 1,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    refunds: parseArray(readField(node, "refunds", "refunds"), parseRefund),
  };
}

function parseCreditNoteLineItem(value: unknown): CreditNoteLineItem | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const id = asString(node.id);
  const description = asString(node.description);
  if (!id || !description) return null;
  return {
    id,
    description,
    amount: asMoneyString(node.amount),
  };
}

export function parseCreditNote(value: unknown): CreditNote | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const invoiceId = asString(readField(node, "invoiceId", "invoice_id"));
  const reason = inSet(node.reason, CREDIT_NOTE_REASONS);
  if (!id || !invoiceId || !reason) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    creditNoteNumber: asString(readField(node, "creditNoteNumber", "credit_note_number")) ?? null,
    financialYear: asString(readField(node, "financialYear", "financial_year")) ?? null,
    invoiceId,
    invoice: parseNamedRef(node.invoice),
    reason,
    amount: asMoneyString(node.amount),
    issuedAt: asIsoDate(readField(node, "issuedAt", "issued_at")),
    approvedBy: asString(readField(node, "approvedBy", "approved_by")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    lineItems: parseArray(readField(node, "lineItems", "line_items"), parseCreditNoteLineItem),
  };
}

export function parseInvoice(value: unknown): Invoice | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const companyId = asString(readField(node, "companyId", "company_id"));
  const status = inSet(node.status, INVOICE_STATUSES);
  if (!id || !companyId || !status) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    invoiceNumber: asString(readField(node, "invoiceNumber", "invoice_number")) ?? null,
    financialYear: asString(readField(node, "financialYear", "financial_year")) ?? null,
    projectId: asString(readField(node, "projectId", "project_id")) ?? null,
    companyId,
    company: parseNamedRef(node.company),
    status,
    taxTreatment: inSet(node.taxTreatment ?? node.tax_treatment, TAX_TREATMENTS),
    billTo: parseBillToSnapshot(readField(node, "billToSnapshot", "bill_to_snapshot") ?? node.billTo),
    amount: asMoneyString(node.amount),
    paidAmount: asMoneyString(readField(node, "paidAmount", "paid_amount")),
    pendingAmount: asMoneyString(readField(node, "pendingAmount", "pending_amount")),
    dueDate: asIsoDate(readField(node, "dueDate", "due_date")),
    sentAt: asIsoDate(readField(node, "sentAt", "sent_at")),
    cancelledAt: asIsoDate(readField(node, "cancelledAt", "cancelled_at")),
    cancellationReason: asString(readField(node, "cancellationReason", "cancellation_reason")) ?? null,
    version: asInt(node.version) ?? 1,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
    lineItems: parseArray(readField(node, "lineItems", "line_items"), parseInvoiceLineItem),
    payments: parseArray(readField(node, "payments", "payments"), parsePayment),
    creditNotes: parseArray(readField(node, "creditNotes", "credit_notes"), parseCreditNote),
  };
}

export function parseExpense(value: unknown): Expense | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const description = asString(node.description);
  const category = asString(node.category);
  if (!id || !description || !category) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    projectId: asString(readField(node, "projectId", "project_id")) ?? null,
    project: parseNamedRef(node.project),
    description,
    amount: asMoneyString(node.amount),
    category,
    incurredAt: asIsoDate(readField(node, "incurredAt", "incurred_at")),
    recordedBy: asString(readField(node, "recordedBy", "recorded_by")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parseForgeFundEntry(value: unknown): ForgeFundEntry | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const type = inSet(node.type, FORGE_FUND_ENTRY_TYPES);
  const reason = asString(node.reason);
  if (!id || !type || !reason) return null;
  return {
    id,
    type,
    amount: asMoneyString(node.amount),
    reason,
    sourceType: asString(readField(node, "sourceType", "source_type")) ?? null,
    sourceId: asString(readField(node, "sourceId", "source_id")) ?? null,
    approvedBy: asString(readField(node, "approvedBy", "approved_by")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parseForgeFundBalance(payload: unknown): string | null {
  const root = isRecord(payload) ? payload : null;
  if (!root) return null;
  const data = isRecord(root.data) ? root.data : root;
  return asMoneyString(data.balance) ?? asMoneyString(data.amount) ?? asMoneyString(data.total);
}

export function parseTaxRate(value: unknown): TaxRate | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const hsnSacCode = asString(readField(node, "hsnSacCode", "hsn_sac_code"));
  const description = asString(node.description);
  if (!id || !hsnSacCode || !description) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    hsnSacCode,
    description,
    cgstRate:
      asMoneyString(readField(node, "cgstRate", "cgst_rate")) ??
      asString(readField(node, "cgstRate", "cgst_rate")) ??
      null,
    sgstRate:
      asMoneyString(readField(node, "sgstRate", "sgst_rate")) ??
      asString(readField(node, "sgstRate", "sgst_rate")) ??
      null,
    igstRate:
      asMoneyString(readField(node, "igstRate", "igst_rate")) ??
      asString(readField(node, "igstRate", "igst_rate")) ??
      null,
    effectiveFrom: asIsoDate(readField(node, "effectiveFrom", "effective_from")),
    effectiveTo: asIsoDate(readField(node, "effectiveTo", "effective_to")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

function toOffsetList<T>(parsed: { items: T[]; pagination: ParsedPagination }): OffsetList<T> {
  if (parsed.pagination.mode === "offset") {
    return {
      items: parsed.items,
      page: parsed.pagination.page,
      pageSize: parsed.pagination.pageSize,
      total: parsed.pagination.total,
    };
  }
  return { items: parsed.items, page: 1, pageSize: parsed.pagination.limit, total: parsed.items.length };
}

function parseNestedList<T>(payload: unknown, parseItem: (value: unknown) => T | null): OffsetList<T> | null {
  const parsed = parseListEnvelope(payload, parseItem);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseInvoiceList(payload: unknown): OffsetList<Invoice> | null {
  return parseNestedList(payload, parseInvoice);
}

export function parsePaymentList(payload: unknown): OffsetList<Payment> | null {
  return parseNestedList(payload, parsePayment);
}

export function parseRefundList(payload: unknown): OffsetList<Refund> | null {
  return parseNestedList(payload, parseRefund);
}

export function parseCreditNoteList(payload: unknown): OffsetList<CreditNote> | null {
  return parseNestedList(payload, parseCreditNote);
}

export function parseExpenseList(payload: unknown): OffsetList<Expense> | null {
  return parseNestedList(payload, parseExpense);
}

export function parseForgeFundEntryList(payload: unknown): OffsetList<ForgeFundEntry> | null {
  return parseNestedList(payload, parseForgeFundEntry);
}

export function parseTaxRateList(payload: unknown): OffsetList<TaxRate> | null {
  return parseNestedList(payload, parseTaxRate);
}
