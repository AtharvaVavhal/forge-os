export const PROPOSAL_STATUSES = [
  "DRAFT",
  "SENT",
  "VIEWED",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export interface NamedRef {
  id: string;
  name: string;
}

export interface ProposalLineItem {
  id: string;
  description: string;
  quantity: string | null;
  unitPrice: string | null;
  taxRateId: string | null;
  sortOrder: number;
}

export interface Proposal {
  id: string;
  organizationId: string | null;
  dealId: string;
  deal: NamedRef | null;
  version: number;
  status: ProposalStatus;
  terms: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  rejectedAt: string | null;
  expiresAt: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lineItems: ProposalLineItem[];
}

export interface OffsetList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
}
