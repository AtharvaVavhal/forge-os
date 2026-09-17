import {
  asBoolean,
  asInt,
  asIsoDate,
  asMoneyString,
  asString,
  isRecord,
  parseListEnvelope,
  readField,
  unwrapData,
} from "@/lib/api/parse-json";
import {
  INVOICE_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  PROPOSAL_STATUSES,
  TAX_TREATMENTS,
  type OffsetList,
  type PortalBillToSnapshot,
  type PortalClientUser,
  type PortalDocument,
  type PortalHandoverSummary,
  type PortalInvoice,
  type PortalInvoiceLineItem,
  type PortalInvoiceStatus,
  type PortalMilestone,
  type PortalMilestoneStatus,
  type PortalPayment,
  type PortalPaymentMethod,
  type PortalPaymentStatus,
  type PortalProject,
  type PortalProjectPhase,
  type PortalProjectStatus,
  type PortalProposal,
  type PortalProposalLineItem,
  type PortalProposalStatus,
  type PortalSignedDownloadUrl,
  type PortalTaxTreatment,
} from "../types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseNamedRef(value: unknown): { id: string; name: string } | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name) ?? asString(value.title);
  if (!id || !name) return null;
  return { id, name };
}

export function parsePortalClientUser(value: unknown): PortalClientUser | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;

  const id = asString(node.id);
  const organizationId = asString(readField(node, "organizationId", "organization_id"));
  const companyId = asString(readField(node, "companyId", "company_id"));
  const email = asString(node.email);

  if (!id || !organizationId || !companyId || !email) {
    return null;
  }

  const contactId = asString(readField(node, "contactId", "contact_id")) ?? null;
  const active = asBoolean(node.active) ?? true;
  const lastLoginAt = asIsoDate(readField(node, "lastLoginAt", "last_login_at"));
  const createdAt = asIsoDate(readField(node, "createdAt", "created_at"));
  const company = parseNamedRef(node.company);
  const contact = parseNamedRef(node.contact);

  return {
    id,
    organizationId,
    companyId,
    contactId,
    email,
    active,
    lastLoginAt,
    createdAt,
    company,
    contact,
  };
}

export function parsePortalProject(value: unknown): PortalProject | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;

  const id = asString(node.id);
  const name = asString(node.name);
  const companyId = asString(readField(node, "companyId", "company_id"));
  if (!id || !name || !companyId) return null;

  const status = inSet(node.status, PROJECT_STATUSES) ?? "ACTIVE";
  const phase = inSet(node.phase, PROJECT_PHASES) ?? "PLANNING";

  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    companyId,
    name,
    status: status as PortalProjectStatus,
    phase: phase as PortalProjectPhase,
    deadline: asIsoDate(node.deadline),
    completedAt: asIsoDate(readField(node, "completedAt", "completed_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parsePortalMilestone(value: unknown): PortalMilestone | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;

  const id = asString(node.id);
  const projectId = asString(readField(node, "projectId", "project_id"));
  const name = asString(node.name);
  if (!id || !projectId || !name) return null;

  const status = (asString(node.status) ?? "PENDING") as PortalMilestoneStatus;
  const requiresClientApproval = asBoolean(readField(node, "requiresClientApproval", "requires_client_approval")) ?? false;

  return {
    id,
    projectId,
    name,
    status,
    requiresClientApproval,
    dueDate: asIsoDate(readField(node, "dueDate", "due_date")),
    sortOrder: asInt(readField(node, "sortOrder", "sort_order")) ?? 0,
    completedAt: asIsoDate(readField(node, "completedAt", "completed_at")),
  };
}

export function parsePortalHandoverSummary(value: unknown): PortalHandoverSummary {
  const raw = unwrapData(value);
  const list = Array.isArray(raw)
    ? raw
    : isRecord(raw) && Array.isArray(raw.items)
    ? raw.items
    : [];

  const items = list
    .map((item) => {
      if (!isRecord(item)) return null;
      const text = asString(item.item) ?? asString(item.title) ?? asString(item.name);
      if (!text) return null;
      return {
        item: text,
        done: asBoolean(item.done) ?? false,
        doneAt: asIsoDate(readField(item, "doneAt", "done_at")),
      };
    })
    .filter((item): item is { item: string; done: boolean; doneAt: string | null } => item !== null);

  return { items };
}

export function parsePortalProposalLineItem(value: unknown): PortalProposalLineItem | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const id = asString(node.id);
  const description = asString(node.description);
  if (!id || !description) return null;

  return {
    id,
    description,
    quantity: asMoneyString(node.quantity),
    unitPrice: asMoneyString(readField(node, "unitPrice", "unit_price")),
    taxRateId: asString(readField(node, "taxRateId", "tax_rate_id")) ?? null,
    sortOrder: asInt(readField(node, "sortOrder", "sort_order")) ?? 0,
  };
}

export function parsePortalProposal(value: unknown): PortalProposal | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;

  const id = asString(node.id);
  if (!id) return null;

  const rawStatus = asString(node.status);
  const status = inSet(rawStatus, PROPOSAL_STATUSES) ?? "DRAFT";
  const version = asInt(node.version) ?? 1;

  const rawItems = readField(node, "lineItems", "line_items");
  const lineItems = Array.isArray(rawItems)
    ? rawItems.map(parsePortalProposalLineItem).filter((item): item is PortalProposalLineItem => item !== null)
    : [];

  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    dealId: asString(readField(node, "dealId", "deal_id")) ?? null,
    version,
    status: status as PortalProposalStatus,
    terms: asString(node.terms) ?? null,
    sentAt: asIsoDate(readField(node, "sentAt", "sent_at")),
    viewedAt: asIsoDate(readField(node, "viewedAt", "viewed_at")),
    acceptedAt: asIsoDate(readField(node, "acceptedAt", "accepted_at")),
    rejectedAt: asIsoDate(readField(node, "rejectedAt", "rejected_at")),
    expiresAt: asIsoDate(readField(node, "expiresAt", "expires_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
    lineItems,
  };
}

export function parsePortalInvoiceLineItem(value: unknown): PortalInvoiceLineItem | null {
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

function parseBillTo(value: unknown): PortalBillToSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    name: asString(value.name) ?? null,
    gstin: asString(value.gstin) ?? null,
    billingState: asString(readField(value, "billingState", "billing_state")) ?? null,
    billingAddress: asString(readField(value, "billingAddress", "billing_address")) ?? null,
  };
}

export function parsePortalPayment(value: unknown): PortalPayment | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const id = asString(node.id);
  if (!id) return null;

  const method = inSet(node.method, PAYMENT_METHODS) ?? "BANK_TRANSFER";
  const status = inSet(node.status, PAYMENT_STATUSES) ?? "COMPLETED";

  return {
    id,
    amount: asMoneyString(node.amount),
    method: method as PortalPaymentMethod,
    status: status as PortalPaymentStatus,
    razorpayPaymentId: asString(readField(node, "razorpayPaymentId", "razorpay_payment_id")) ?? null,
    paidAt: asIsoDate(readField(node, "paidAt", "paid_at")),
  };
}

export function parsePortalInvoice(value: unknown): PortalInvoice | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;

  const id = asString(node.id);
  const companyId = asString(readField(node, "companyId", "company_id"));
  if (!id || !companyId) return null;

  const status = inSet(node.status, INVOICE_STATUSES) ?? "SENT";
  const taxTreatment = inSet(readField(node, "taxTreatment", "tax_treatment"), TAX_TREATMENTS);

  const rawLineItems = readField(node, "lineItems", "line_items");
  const lineItems = Array.isArray(rawLineItems)
    ? rawLineItems.map(parsePortalInvoiceLineItem).filter((item): item is PortalInvoiceLineItem => item !== null)
    : [];

  const rawPayments = node.payments;
  const payments = Array.isArray(rawPayments)
    ? rawPayments.map(parsePortalPayment).filter((item): item is PortalPayment => item !== null)
    : [];

  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    companyId,
    invoiceNumber: asString(readField(node, "invoiceNumber", "invoice_number")) ?? null,
    financialYear: asString(readField(node, "financialYear", "financial_year")) ?? null,
    status: status as PortalInvoiceStatus,
    taxTreatment: taxTreatment as PortalTaxTreatment | null,
    billTo: parseBillTo(readField(node, "billTo", "bill_to")),
    amount: asMoneyString(node.amount),
    paidAmount: asMoneyString(readField(node, "paidAmount", "paid_amount")),
    pendingAmount: asMoneyString(readField(node, "pendingAmount", "pending_amount")),
    dueDate: asIsoDate(readField(node, "dueDate", "due_date")),
    sentAt: asIsoDate(readField(node, "sentAt", "sent_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
    lineItems,
    payments,
  };
}

export function parsePortalDocument(value: unknown): PortalDocument | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;

  const id = asString(node.id);
  const title = asString(node.title) ?? asString(node.fileName) ?? "Document";
  const fileName = asString(readField(node, "fileName", "file_name")) ?? title;
  const mimeType = asString(readField(node, "mimeType", "mime_type")) ?? "application/octet-stream";
  const fileSizeBytes = asInt(readField(node, "fileSizeBytes", "file_size_bytes")) ?? 0;
  const createdAt = asIsoDate(readField(node, "createdAt", "created_at")) ?? new Date().toISOString();

  if (!id) return null;

  return {
    id,
    title,
    fileName,
    mimeType,
    fileSizeBytes,
    visibility: "CLIENT_VISIBLE",
    createdAt,
  };
}

export function parsePortalSignedDownloadUrl(value: unknown): PortalSignedDownloadUrl | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;

  const url = asString(node.url) ?? asString(node.downloadUrl);
  if (!url) return null;

  return {
    url,
    expiresInSeconds: asInt(readField(node, "expiresInSeconds", "expires_in_seconds")) ?? undefined,
  };
}

export function parsePortalProjectsList(payload: unknown): OffsetList<PortalProject> {
  const envelope = parseListEnvelope(payload, parsePortalProject);
  return {
    items: envelope.items,
    page: envelope.pagination.mode === "offset" ? envelope.pagination.page : 1,
    pageSize: envelope.pagination.mode === "offset" ? envelope.pagination.pageSize : envelope.items.length,
    total: envelope.pagination.mode === "offset" ? envelope.pagination.total : envelope.items.length,
  };
}

export function parsePortalProposalsList(payload: unknown): OffsetList<PortalProposal> {
  const envelope = parseListEnvelope(payload, parsePortalProposal);
  return {
    items: envelope.items,
    page: envelope.pagination.mode === "offset" ? envelope.pagination.page : 1,
    pageSize: envelope.pagination.mode === "offset" ? envelope.pagination.pageSize : envelope.items.length,
    total: envelope.pagination.mode === "offset" ? envelope.pagination.total : envelope.items.length,
  };
}

export function parsePortalInvoicesList(payload: unknown): OffsetList<PortalInvoice> {
  const envelope = parseListEnvelope(payload, parsePortalInvoice);
  return {
    items: envelope.items,
    page: envelope.pagination.mode === "offset" ? envelope.pagination.page : 1,
    pageSize: envelope.pagination.mode === "offset" ? envelope.pagination.pageSize : envelope.items.length,
    total: envelope.pagination.mode === "offset" ? envelope.pagination.total : envelope.items.length,
  };
}

export function parsePortalDocumentsList(payload: unknown): OffsetList<PortalDocument> {
  const envelope = parseListEnvelope(payload, parsePortalDocument);
  return {
    items: envelope.items,
    page: envelope.pagination.mode === "offset" ? envelope.pagination.page : 1,
    pageSize: envelope.pagination.mode === "offset" ? envelope.pagination.pageSize : envelope.items.length,
    total: envelope.pagination.mode === "offset" ? envelope.pagination.total : envelope.items.length,
  };
}
