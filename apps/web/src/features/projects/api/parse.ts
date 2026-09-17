import {
  asBoolean,
  asInt,
  asIsoDate,
  asString,
  isRecord,
  parseListEnvelope,
  readField,
  unwrapData,
  type ParsedPagination,
} from "@/lib/api/parse-json";
import {
  MILESTONE_STATUSES,
  PROJECT_PHASES,
  PROJECT_STATUSES,
  TASK_PRIORITIES,
  TASK_STATUSES,
  type HandoverItem,
  type Milestone,
  type OffsetList,
  type Project,
  type Task,
  type TimeEntry,
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

export function parseHandoverItem(value: unknown): HandoverItem | null {
  if (!isRecord(value)) return null;
  const item = asString(value.item);
  const done = asBoolean(value.done);
  if (!item || done === undefined) return null;
  return {
    item,
    done,
    doneAt: asIsoDate(readField(value, "doneAt", "done_at")),
    doneBy: asString(readField(value, "doneBy", "done_by")) ?? null,
  };
}

function parseHandover(value: unknown): HandoverItem[] {
  if (!Array.isArray(value)) return [];
  return value.map(parseHandoverItem).filter((item): item is HandoverItem => item !== null);
}

export function parseProject(value: unknown): Project | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const name = asString(node.name);
  const companyId = asString(readField(node, "companyId", "company_id"));
  const ownerId = asString(readField(node, "ownerId", "owner_id"));
  const status = inSet(node.status, PROJECT_STATUSES);
  const phase = inSet(node.phase, PROJECT_PHASES);
  if (!id || !name || !companyId || !ownerId || !status || !phase) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    name,
    dealId: asString(readField(node, "dealId", "deal_id")) ?? null,
    acceptedProposalId: asString(readField(node, "acceptedProposalId", "accepted_proposal_id")) ?? null,
    companyId,
    company: parseNamedRef(node.company),
    status,
    phase,
    ownerId,
    deadline: asIsoDate(node.deadline),
    handoverChecklist: parseHandover(readField(node, "handoverChecklist", "handover_checklist")),
    completedAt: asIsoDate(readField(node, "completedAt", "completed_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parseMilestone(value: unknown): Milestone | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const projectId = asString(readField(node, "projectId", "project_id"));
  const name = asString(node.name);
  const status = inSet(node.status, MILESTONE_STATUSES);
  if (!id || !projectId || !name || !status) return null;
  return {
    id,
    projectId,
    name,
    status,
    requiresClientApproval: asBoolean(readField(node, "requiresClientApproval", "requires_client_approval")) ?? false,
    approvedAt: asIsoDate(readField(node, "approvedAt", "approved_at")),
    approvedByContactId: asString(readField(node, "approvedByContactId", "approved_by_contact_id")) ?? null,
    dueDate: asIsoDate(readField(node, "dueDate", "due_date")),
    sortOrder: asInt(readField(node, "sortOrder", "sort_order")) ?? 0,
  };
}

export function parseTask(value: unknown): Task | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const projectId = asString(readField(node, "projectId", "project_id"));
  const title = asString(node.title);
  const status = inSet(node.status, TASK_STATUSES);
  const priority = inSet(node.priority, TASK_PRIORITIES);
  if (!id || !projectId || !title || !status || !priority) return null;
  return {
    id,
    projectId,
    milestoneId: asString(readField(node, "milestoneId", "milestone_id")) ?? null,
    title,
    status,
    priority,
    assigneeId: asString(readField(node, "assigneeId", "assignee_id")) ?? null,
    dueDate: asIsoDate(readField(node, "dueDate", "due_date")),
    blockedByTaskId: asString(readField(node, "blockedByTaskId", "blocked_by_task_id")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parseTimeEntry(value: unknown): TimeEntry | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const taskId = asString(readField(node, "taskId", "task_id"));
  const userId = asString(readField(node, "userId", "user_id"));
  const minutes = asInt(node.minutes);
  if (!id || !taskId || !userId || minutes === null) return null;
  return {
    id,
    taskId,
    userId,
    minutes,
    loggedAt: asIsoDate(readField(node, "loggedAt", "logged_at")),
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

export function parseProjectList(payload: unknown): OffsetList<Project> | null {
  return parseNestedList(payload, parseProject);
}

export function parseMilestoneList(payload: unknown): OffsetList<Milestone> | null {
  return parseNestedList(payload, parseMilestone);
}

export function parseTaskList(payload: unknown): OffsetList<Task> | null {
  return parseNestedList(payload, parseTask);
}

export function parseTimeEntryList(payload: unknown): OffsetList<TimeEntry> | null {
  return parseNestedList(payload, parseTimeEntry);
}
