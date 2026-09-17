import {
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
  DEAL_LOST_REASONS,
  DEAL_STAGES,
  FORGE_FUND_ENTRY_TYPES,
  LEAD_SOURCES,
  LEAD_STATUSES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  type Activity,
  type Company,
  type Contact,
  type CursorList,
  type Deal,
  type DealLostReason,
  type DealStage,
  type ForgeFundEntry,
  type Lead,
  type LeadSource,
  type LeadStatus,
  type NamedRef,
  type OffsetList,
  type ProjectSummary,
} from "./types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseNamedRef(value: unknown): NamedRef | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  if (!id || !name) return null;
  return { id, name };
}

function parseTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export function parseCompany(value: unknown): Company | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const name = asString(node.name);
  if (!id || !name) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    name,
    gstin: asString(node.gstin) ?? null,
    billingState: asString(readField(node, "billingState", "billing_state")) ?? null,
    billingAddress: asString(readField(node, "billingAddress", "billing_address")) ?? null,
    tags: parseTags(node.tags),
    archivedAt: asIsoDate(readField(node, "archivedAt", "archived_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parseContact(value: unknown): Contact | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const name = asString(node.name);
  if (!id || !name) return null;
  const company = parseNamedRef(node.company);
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    companyId: asString(readField(node, "companyId", "company_id")) ?? company?.id ?? null,
    company,
    name,
    email: asString(node.email) ?? null,
    phone: asString(node.phone) ?? null,
    archivedAt: asIsoDate(readField(node, "archivedAt", "archived_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parseLead(value: unknown): Lead | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const status = inSet(node.status, LEAD_STATUSES);
  const source = inSet(node.source, LEAD_SOURCES);
  if (!id || !status || !source) return null;
  const company = parseNamedRef(node.company);
  const contact = parseNamedRef(node.contact);
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    contactId: asString(readField(node, "contactId", "contact_id")) ?? contact?.id ?? null,
    companyId: asString(readField(node, "companyId", "company_id")) ?? company?.id ?? null,
    contact,
    company,
    status,
    source,
    notes: asString(node.notes) ?? null,
    convertedToDealId: asString(readField(node, "convertedToDealId", "converted_to_deal_id")) ?? null,
    archivedAt: asIsoDate(readField(node, "archivedAt", "archived_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parseDeal(value: unknown): Deal | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const title = asString(node.title);
  const stage = inSet(node.stage, DEAL_STAGES);
  const ownerId = asString(readField(node, "ownerId", "owner_id"));
  if (!id || !title || !stage || !ownerId) return null;
  const company = parseNamedRef(node.company);
  const contact = parseNamedRef(node.contact);
  const lostReason = inSet(readField(node, "lostReason", "lost_reason"), DEAL_LOST_REASONS);
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    title,
    companyId: asString(readField(node, "companyId", "company_id")) ?? company?.id ?? null,
    contactId: asString(readField(node, "contactId", "contact_id")) ?? contact?.id ?? null,
    company,
    contact,
    stage,
    estimatedValue: asMoneyString(readField(node, "estimatedValue", "estimated_value")),
    ownerId,
    lostReason,
    nextFollowUpAt: asIsoDate(readField(node, "nextFollowUpAt", "next_follow_up_at")),
    reopenedFromDealId: asString(readField(node, "reopenedFromDealId", "reopened_from_deal_id")) ?? null,
    archivedAt: asIsoDate(readField(node, "archivedAt", "archived_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parseActivity(value: unknown): Activity | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const type = asString(node.type);
  const summary = asString(node.summary);
  if (!id || !type || !summary) return null;
  return {
    id,
    type,
    summary,
    occurredAt: asIsoDate(readField(node, "occurredAt", "occurred_at")),
    companyId: asString(readField(node, "companyId", "company_id")) ?? null,
    contactId: asString(readField(node, "contactId", "contact_id")) ?? null,
    dealId: asString(readField(node, "dealId", "deal_id")) ?? null,
    projectId: asString(readField(node, "projectId", "project_id")) ?? null,
    createdBy: asString(readField(node, "createdBy", "created_by")) ?? null,
  };
}

export function parseProjectSummary(value: unknown): ProjectSummary | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const name = asString(node.name);
  const status = inSet(node.status, PROJECT_STATUSES);
  const phase = inSet(node.phase, PROJECT_PHASES);
  const companyId = asString(readField(node, "companyId", "company_id"));
  const ownerId = asString(readField(node, "ownerId", "owner_id"));
  if (!id || !name || !status || !phase || !companyId || !ownerId) return null;
  return {
    id,
    name,
    status,
    phase,
    companyId,
    company: parseNamedRef(node.company),
    ownerId,
    deadline: asIsoDate(node.deadline),
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

/** Document 5 catalog: POST /leads/:id/convert returns `{ lead, deal }`. */
export function parseLeadConversion(value: unknown): { lead: Lead; deal: Deal } | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const lead = parseLead(node.lead);
  const deal = parseDeal(node.deal);
  if (!lead || !deal) return null;
  return { lead, deal };
}

export function parseForgeFundBalance(payload: unknown): string | null {
  const root = isRecord(payload) ? payload : null;
  if (!root) return null;
  const data = isRecord(root.data) ? root.data : root;
  return asMoneyString(data.balance) ?? asMoneyString(data.amount) ?? asMoneyString(data.total);
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

function toCursorList<T>(parsed: { items: T[]; pagination: ParsedPagination }): CursorList<T> {
  if (parsed.pagination.mode === "cursor") {
    return {
      items: parsed.items,
      limit: parsed.pagination.limit,
      nextCursor: parsed.pagination.nextCursor,
    };
  }
  return { items: parsed.items, limit: parsed.pagination.pageSize, nextCursor: null };
}

export function parseCompanyList(payload: unknown): OffsetList<Company> | null {
  const parsed = parseListEnvelope(payload, parseCompany);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseContactList(payload: unknown): CursorList<Contact> | null {
  const parsed = parseListEnvelope(payload, parseContact);
  return parsed ? toCursorList(parsed) : null;
}

export function parseLeadList(payload: unknown): OffsetList<Lead> | null {
  const parsed = parseListEnvelope(payload, parseLead);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseDealList(payload: unknown): OffsetList<Deal> | null {
  const parsed = parseListEnvelope(payload, parseDeal);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseActivityList(payload: unknown): CursorList<Activity> | null {
  const parsed = parseListEnvelope(payload, parseActivity);
  return parsed ? toCursorList(parsed) : null;
}

export function parseProjectList(payload: unknown): OffsetList<ProjectSummary> | null {
  const parsed = parseListEnvelope(payload, parseProjectSummary);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseForgeFundEntryList(payload: unknown): OffsetList<ForgeFundEntry> | null {
  const parsed = parseListEnvelope(payload, parseForgeFundEntry);
  return parsed ? toOffsetList(parsed) : null;
}

export type { LeadStatus, LeadSource, DealStage, DealLostReason };
