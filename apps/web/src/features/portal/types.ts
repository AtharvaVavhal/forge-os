/**
 * Portal plane types (Document 5 §11, Document 6 §1.3 / §9).
 *
 * CRITICAL ARCHITECTURAL RULE:
 * ClientUser is a SEPARATE AUTHENTICATION PLANE from internal User.
 * Never mix internal User roles or workspace sessions with ClientUser.
 */

export interface NamedRef {
  id: string;
  name: string;
}

export interface PortalClientUser {
  id: string;
  organizationId: string;
  companyId: string;
  contactId: string | null;
  email: string;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
  company?: NamedRef | null;
  contact?: NamedRef | null;
}

export interface PortalAuthContext {
  clientUser: PortalClientUser;
}

export interface PortalLoginRequest {
  email: string;
  password: string;
}

export const PORTAL_SESSION_COOKIE_NAME = "portal_session";

export const PROPOSAL_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;
export type PortalProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface PortalProposalLineItem {
  id: string;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  taxRateId: string | null;
  sortOrder: number;
}

export interface PortalProposal {
  id: string;
  organizationId: string | null;
  dealId: string | null;
  version: number;
  status: PortalProposalStatus;
  terms: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lineItems: PortalProposalLineItem[];
}

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"] as const;
export type PortalProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PHASES = [
  "PLANNING",
  "DESIGN",
  "DEVELOPMENT",
  "QA",
  "CLIENT_REVIEW",
  "DEPLOYMENT",
  "HANDOVER",
  "COMPLETED",
] as const;
export type PortalProjectPhase = (typeof PROJECT_PHASES)[number];

export interface PortalProject {
  id: string;
  organizationId: string | null;
  companyId: string;
  name: string;
  status: PortalProjectStatus;
  phase: PortalProjectPhase;
  deadline: string | null;
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export const MILESTONE_STATUSES = ["PENDING", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETED"] as const;
export type PortalMilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export interface PortalMilestone {
  id: string;
  projectId: string;
  name: string;
  status: PortalMilestoneStatus;
  requiresClientApproval: boolean;
  dueDate: string | null;
  sortOrder?: number;
  completedAt: string | null;
}

export interface PortalHandoverItem {
  item: string;
  done: boolean;
  doneAt: string | null;
}

export interface PortalHandoverSummary {
  items: PortalHandoverItem[];
}

export const INVOICE_STATUSES = [
  "DRAFT",
  "SENT",
  "PARTIALLY_PAID",
  "PAID",
  "OVERDUE",
  "VOID",
  "CANCELLED",
] as const;
export type PortalInvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const TAX_TREATMENTS = ["CGST_SGST", "IGST", "EXEMPT"] as const;
export type PortalTaxTreatment = (typeof TAX_TREATMENTS)[number];

export interface PortalBillToSnapshot {
  name: string | null;
  gstin: string | null;
  billingState: string | null;
  billingAddress: string | null;
}

export interface PortalInvoiceLineItem {
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

export const PAYMENT_STATUSES = ["PENDING", "COMPLETED", "FAILED", "REVERSED"] as const;
export type PortalPaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["RAZORPAY", "CASH", "BANK_TRANSFER", "CHEQUE"] as const;
export type PortalPaymentMethod = (typeof PAYMENT_METHODS)[number];

export interface PortalPayment {
  id: string;
  amount: string | null;
  method: PortalPaymentMethod;
  status: PortalPaymentStatus;
  razorpayPaymentId: string | null;
  paidAt: string | null;
}

export interface PortalInvoice {
  id: string;
  organizationId: string | null;
  companyId: string;
  invoiceNumber: string | null;
  financialYear: string | null;
  status: PortalInvoiceStatus;
  taxTreatment: PortalTaxTreatment | null;
  billTo: PortalBillToSnapshot | null;
  amount: string | null;
  paidAmount: string | null;
  pendingAmount: string | null;
  dueDate: string | null;
  sentAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lineItems: PortalInvoiceLineItem[];
  payments: PortalPayment[];
}

export interface PortalDocument {
  id: string;
  title: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  visibility: "CLIENT_VISIBLE";
  createdAt: string;
}

export interface PortalSignedDownloadUrl {
  url: string;
  expiresInSeconds?: number;
}

export interface OffsetList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
}
