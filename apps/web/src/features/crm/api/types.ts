export const LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "CONVERTED",
  "DISQUALIFIED",
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const LEAD_SOURCES = [
  "REFERRAL",
  "INBOUND_FORM",
  "COLD_OUTREACH",
  "LINKEDIN",
  "PAST_CLIENT",
  "EVENT",
  "OTHER",
] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const DEAL_STAGES = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "DISCOVERY",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

export const DEAL_LOST_REASONS = [
  "PRICE",
  "TIMING",
  "CHOSE_COMPETITOR",
  "NO_BUDGET",
  "GHOSTED",
  "NOT_A_FIT",
  "OTHER",
] as const;
export type DealLostReason = (typeof DEAL_LOST_REASONS)[number];

export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

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
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const FORGE_FUND_ENTRY_TYPES = ["CONTRIBUTION", "WITHDRAWAL", "ALLOCATION"] as const;
export type ForgeFundEntryType = (typeof FORGE_FUND_ENTRY_TYPES)[number];

export interface NamedRef {
  id: string;
  name: string;
}

export interface Company {
  id: string;
  organizationId: string | null;
  name: string;
  gstin: string | null;
  billingState: string | null;
  billingAddress: string | null;
  tags: string[];
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Contact {
  id: string;
  organizationId: string | null;
  companyId: string | null;
  company: NamedRef | null;
  name: string;
  email: string | null;
  phone: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Lead {
  id: string;
  organizationId: string | null;
  contactId: string | null;
  companyId: string | null;
  contact: NamedRef | null;
  company: NamedRef | null;
  status: LeadStatus;
  source: LeadSource;
  notes: string | null;
  convertedToDealId: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Deal {
  id: string;
  organizationId: string | null;
  title: string;
  companyId: string | null;
  contactId: string | null;
  company: NamedRef | null;
  contact: NamedRef | null;
  stage: DealStage;
  estimatedValue: string | null;
  ownerId: string;
  lostReason: DealLostReason | null;
  nextFollowUpAt: string | null;
  reopenedFromDealId: string | null;
  archivedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Activity {
  id: string;
  type: string;
  summary: string;
  occurredAt: string | null;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  projectId: string | null;
  createdBy: string | null;
}

export interface ProjectSummary {
  id: string;
  name: string;
  status: ProjectStatus;
  phase: ProjectPhase;
  companyId: string;
  company: NamedRef | null;
  ownerId: string;
  deadline: string | null;
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

export interface CursorList<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}
