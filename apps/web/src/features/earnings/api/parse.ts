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
  PAYOUT_METHODS,
  PROJECT_ALLOCATION_STATUSES,
  TEAM_PAYOUT_STATUSES,
  type ActorRef,
  type OffsetList,
  type ProjectAllocation,
  type ProjectAllocationLine,
  type ProjectAllocationListItem,
  type TeamEarningEntry,
  type TeamEarningsSummary,
  type TeamPayoutDestination,
  type TeamPayoutListItem,
  type TeamPayoutRequest,
} from "./types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

function parseArray<T>(value: unknown, parseItem: (item: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseItem).filter((item): item is T => item !== null);
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

function parseActorRef(value: unknown): ActorRef | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const name = asString(value.name);
  const email = asString(value.email);
  if (!id || !name || !email) return null;
  return { id, name, email };
}

/** amount fields are money decimal strings — never coerced to a plain string, so a malformed value fails parsing rather than rendering silently wrong. */
function requireMoney(value: unknown): string | null {
  return asMoneyString(value);
}

export function parseProjectAllocationLine(value: unknown): ProjectAllocationLine | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const userId = asString(readField(value, "userId", "user_id"));
  const userName = asString(readField(value, "userName", "user_name"));
  const userEmail = asString(readField(value, "userEmail", "user_email"));
  const amount = requireMoney(value.amount);
  if (!id || !userId || !userName || !userEmail || amount === null) return null;
  return {
    id,
    userId,
    userName,
    userEmail,
    amount,
    note: asString(value.note) ?? null,
    createdAt: asIsoDate(readField(value, "createdAt", "created_at")) ?? "",
    updatedAt: asIsoDate(readField(value, "updatedAt", "updated_at")) ?? "",
  };
}

export function parseProjectAllocation(payload: unknown): ProjectAllocation | null {
  const node = isRecord(unwrapData(payload)) ? (unwrapData(payload) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const projectId = asString(readField(node, "projectId", "project_id"));
  const projectName = asString(readField(node, "projectName", "project_name"));
  const status = inSet(node.status, PROJECT_ALLOCATION_STATUSES);
  const revenue = requireMoney(node.revenue);
  const expenses = requireMoney(node.expenses);
  const distributable = requireMoney(node.distributable);
  const totalAllocated = requireMoney(readField(node, "totalAllocated", "total_allocated"));
  const projectCumulativeApprovedTotal = requireMoney(
    readField(node, "projectCumulativeApprovedTotal", "project_cumulative_approved_total")
  );
  const projectRemaining = requireMoney(readField(node, "projectRemaining", "project_remaining"));
  const createdBy = parseActorRef(readField(node, "createdBy", "created_by"));
  if (
    !id ||
    !projectId ||
    !projectName ||
    !status ||
    revenue === null ||
    expenses === null ||
    distributable === null ||
    totalAllocated === null ||
    projectCumulativeApprovedTotal === null ||
    projectRemaining === null ||
    !createdBy
  ) {
    return null;
  }
  return {
    id,
    projectId,
    projectName,
    status,
    adjustmentOfId: asString(readField(node, "adjustmentOfId", "adjustment_of_id")) ?? null,
    revenue,
    expenses,
    distributable,
    totalAllocated,
    projectCumulativeApprovedTotal,
    projectRemaining,
    createdBy,
    approvedBy: parseActorRef(readField(node, "approvedBy", "approved_by")),
    approvedAt: asIsoDate(readField(node, "approvedAt", "approved_at")),
    cancelledAt: asIsoDate(readField(node, "cancelledAt", "cancelled_at")),
    version: asInt(node.version) ?? 1,
    lines: parseArray(node.lines, parseProjectAllocationLine),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")) ?? "",
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")) ?? "",
  };
}

export function parseProjectAllocationListItem(value: unknown): ProjectAllocationListItem | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const projectId = asString(readField(value, "projectId", "project_id"));
  const projectName = asString(readField(value, "projectName", "project_name"));
  const status = inSet(value.status, PROJECT_ALLOCATION_STATUSES);
  const totalAllocated = requireMoney(readField(value, "totalAllocated", "total_allocated"));
  if (!id || !projectId || !projectName || !status || totalAllocated === null) return null;
  return {
    id,
    projectId,
    projectName,
    status,
    adjustmentOfId: asString(readField(value, "adjustmentOfId", "adjustment_of_id")) ?? null,
    totalAllocated,
    approvedAt: asIsoDate(readField(value, "approvedAt", "approved_at")),
    createdAt: asIsoDate(readField(value, "createdAt", "created_at")) ?? "",
    updatedAt: asIsoDate(readField(value, "updatedAt", "updated_at")) ?? "",
  };
}

export function parseProjectAllocationList(payload: unknown): OffsetList<ProjectAllocationListItem> | null {
  const parsed = parseListEnvelope(payload, parseProjectAllocationListItem);
  return parsed ? toOffsetList(parsed) : null;
}

function parseTeamPayoutDestination(value: unknown): TeamPayoutDestination | null {
  if (!isRecord(value)) return null;
  const method = inSet(value.method, PAYOUT_METHODS);
  if (!method) return null;
  return {
    method,
    accountHolderName: asString(readField(value, "accountHolderName", "account_holder_name")),
    bankName: asString(readField(value, "bankName", "bank_name")),
    accountNumber: asString(readField(value, "accountNumber", "account_number")),
    ifsc: asString(value.ifsc),
    upiId: asString(readField(value, "upiId", "upi_id")),
  };
}

export function parseTeamPayoutRequest(payload: unknown): TeamPayoutRequest | null {
  const node = isRecord(unwrapData(payload)) ? (unwrapData(payload) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const userId = asString(readField(node, "userId", "user_id"));
  const userName = asString(readField(node, "userName", "user_name"));
  const userEmail = asString(readField(node, "userEmail", "user_email"));
  const amount = requireMoney(node.amount);
  const status = inSet(node.status, TEAM_PAYOUT_STATUSES);
  const payoutMethod = inSet(readField(node, "payoutMethod", "payout_method"), PAYOUT_METHODS);
  const destination = parseTeamPayoutDestination(node.destination);
  if (!id || !userId || !userName || !userEmail || amount === null || !status || !payoutMethod || !destination) {
    return null;
  }
  return {
    id,
    userId,
    userName,
    userEmail,
    amount,
    status,
    payoutMethod,
    destination,
    requestedAt: asIsoDate(readField(node, "requestedAt", "requested_at")) ?? "",
    reviewedBy: parseActorRef(readField(node, "reviewedBy", "reviewed_by")),
    reviewedAt: asIsoDate(readField(node, "reviewedAt", "reviewed_at")),
    approvedBy: parseActorRef(readField(node, "approvedBy", "approved_by")),
    approvedAt: asIsoDate(readField(node, "approvedAt", "approved_at")),
    processingStartedAt: asIsoDate(readField(node, "processingStartedAt", "processing_started_at")),
    processor: asString(node.processor) ?? null,
    paidAt: asIsoDate(readField(node, "paidAt", "paid_at")),
    rejectedAt: asIsoDate(readField(node, "rejectedAt", "rejected_at")),
    rejectionReason: asString(readField(node, "rejectionReason", "rejection_reason")) ?? null,
    failureReason: asString(readField(node, "failureReason", "failure_reason")) ?? null,
    externalReference: asString(readField(node, "externalReference", "external_reference")) ?? null,
    version: asInt(node.version) ?? 1,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")) ?? "",
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")) ?? "",
  };
}

export function parseTeamPayoutListItem(value: unknown): TeamPayoutListItem | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const userId = asString(readField(value, "userId", "user_id"));
  const userName = asString(readField(value, "userName", "user_name"));
  const amount = requireMoney(value.amount);
  const status = inSet(value.status, TEAM_PAYOUT_STATUSES);
  const payoutMethod = inSet(readField(value, "payoutMethod", "payout_method"), PAYOUT_METHODS);
  if (!id || !userId || !userName || amount === null || !status || !payoutMethod) return null;
  return {
    id,
    userId,
    userName,
    amount,
    status,
    payoutMethod,
    requestedAt: asIsoDate(readField(value, "requestedAt", "requested_at")) ?? "",
    paidAt: asIsoDate(readField(value, "paidAt", "paid_at")),
  };
}

export function parseTeamPayoutList(payload: unknown): OffsetList<TeamPayoutListItem> | null {
  const parsed = parseListEnvelope(payload, parseTeamPayoutListItem);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseTeamPayoutRequestList(payload: unknown): OffsetList<TeamPayoutRequest> | null {
  const parsed = parseListEnvelope(payload, parseTeamPayoutRequest);
  return parsed ? toOffsetList(parsed) : null;
}

export function parseTeamEarningsSummary(payload: unknown): TeamEarningsSummary | null {
  const node = isRecord(unwrapData(payload)) ? (unwrapData(payload) as Record<string, unknown>) : null;
  if (!node) return null;
  const available = requireMoney(node.available);
  const pending = requireMoney(node.pending);
  const lifetimeEarned = requireMoney(readField(node, "lifetimeEarned", "lifetime_earned"));
  const lifetimePaid = requireMoney(readField(node, "lifetimePaid", "lifetime_paid"));
  if (available === null || pending === null || lifetimeEarned === null || lifetimePaid === null) return null;
  return { available, pending, lifetimeEarned, lifetimePaid };
}

export function parseTeamEarningEntry(value: unknown): TeamEarningEntry | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const projectId = asString(readField(value, "projectId", "project_id"));
  const projectName = asString(readField(value, "projectName", "project_name"));
  const amount = requireMoney(value.amount);
  const date = asIsoDate(value.date);
  if (!id || !projectId || !projectName || amount === null || !date) return null;
  return { id, projectId, projectName, amount, status: "APPROVED", date };
}

export function parseTeamEarningEntryList(payload: unknown): OffsetList<TeamEarningEntry> | null {
  const parsed = parseListEnvelope(payload, parseTeamEarningEntry);
  return parsed ? toOffsetList(parsed) : null;
}
