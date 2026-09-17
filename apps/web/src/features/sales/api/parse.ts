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
  PROPOSAL_STATUSES,
  type OffsetList,
  type Proposal,
  type ProposalLineItem,
  type ProposalStatus,
} from "./types";

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

export function parseProposalLineItem(value: unknown): ProposalLineItem | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const id = asString(node.id);
  const description = asString(node.description);
  if (!id || !description) return null;
  return {
    id,
    description,
    quantity: asMoneyString(readField(node, "quantity", "quantity")),
    unitPrice: asMoneyString(readField(node, "unitPrice", "unit_price")),
    taxRateId: asString(readField(node, "taxRateId", "tax_rate_id")) ?? null,
    sortOrder: asInt(readField(node, "sortOrder", "sort_order")) ?? 0,
  };
}

function parseLineItems(node: Record<string, unknown>): ProposalLineItem[] {
  const raw = readField(node, "lineItems", "line_items");
  if (!Array.isArray(raw)) return [];
  return raw.map(parseProposalLineItem).filter((item): item is ProposalLineItem => item !== null);
}

export function parseProposal(value: unknown): Proposal | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const dealId = asString(readField(node, "dealId", "deal_id"));
  const version = asInt(node.version);
  const status = inSet(node.status, PROPOSAL_STATUSES);
  if (!id || !dealId || version === null || !status) return null;
  const deal = parseNamedRef(node.deal);
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    dealId,
    deal,
    version,
    status,
    terms: asString(node.terms) ?? null,
    sentAt: asIsoDate(readField(node, "sentAt", "sent_at")),
    viewedAt: asIsoDate(readField(node, "viewedAt", "viewed_at")),
    acceptedAt: asIsoDate(readField(node, "acceptedAt", "accepted_at")),
    rejectedAt: asIsoDate(readField(node, "rejectedAt", "rejected_at")),
    expiresAt: asIsoDate(readField(node, "expiresAt", "expires_at")),
    createdBy: asString(readField(node, "createdBy", "created_by")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
    lineItems: parseLineItems(node),
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

export function parseProposalList(payload: unknown): OffsetList<Proposal> | null {
  const parsed = parseListEnvelope(payload, parseProposal);
  return parsed ? toOffsetList(parsed) : null;
}

export type { ProposalStatus };
