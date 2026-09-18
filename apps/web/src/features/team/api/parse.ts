import { USER_ROLES, type UserRole } from "@forge/types";
import {
  asBoolean,
  asInt,
  asIsoDate,
  asString,
  isRecord,
  parseListEnvelope,
  readField,
  unwrapData,
} from "@/lib/api/parse-json";
import type { CreateInvitationResult, OffsetList, TeamMember, WorkloadRow } from "./types";

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

export function parseTeamMember(value: unknown): TeamMember | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const email = asString(node.email);
  const role = node.role;
  if (!id || !email || !isUserRole(role)) return null;
  return {
    id,
    organizationId: asString(readField(node, "organizationId", "organization_id")) ?? null,
    email,
    name: asString(node.name) ?? email,
    role,
    active: asBoolean(node.active) ?? true,
    lastLoginAt: asIsoDate(readField(node, "lastLoginAt", "last_login_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

function toOffsetList<T>(
  parsed: { items: T[]; pagination: { mode: string; page?: number; pageSize?: number; limit?: number; total?: number | null } }
): OffsetList<T> {
  if (parsed.pagination.mode === "offset") {
    return {
      items: parsed.items,
      page: parsed.pagination.page ?? 1,
      pageSize: parsed.pagination.pageSize ?? 25,
      total: parsed.pagination.total ?? null,
    };
  }
  return {
    items: parsed.items,
    page: 1,
    pageSize: parsed.pagination.limit ?? parsed.items.length,
    total: parsed.items.length,
  };
}

export function parseTeamMemberList(payload: unknown): OffsetList<TeamMember> | null {
  const parsed = parseListEnvelope(payload, parseTeamMember);
  if (parsed) return toOffsetList(parsed);
  const data = unwrapData(payload);
  if (isRecord(data) && Array.isArray(data.users)) {
    return {
      items: data.users.map(parseTeamMember).filter((item): item is TeamMember => item !== null),
      page: 1,
      pageSize: data.users.length,
      total: data.users.length,
    };
  }
  if (Array.isArray(data)) {
    return {
      items: data.map(parseTeamMember).filter((item): item is TeamMember => item !== null),
      page: 1,
      pageSize: data.length,
      total: data.length,
    };
  }
  return null;
}

export function parseWorkloadRow(value: unknown): WorkloadRow | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const userNode = isRecord(node.user) ? node.user : node;
  const userId =
    asString(readField(node, "userId", "user_id")) ??
    asString(readField(node, "assigneeId", "assignee_id")) ??
    asString(userNode.id);
  if (!userId) return null;
  const role = userNode.role ?? node.role;
  return {
    userId,
    name: asString(userNode.name) ?? asString(node.name) ?? null,
    email: asString(userNode.email) ?? asString(node.email) ?? null,
    role: isUserRole(role) ? role : null,
    openTaskCount:
      asInt(readField(node, "openTaskCount", "open_task_count")) ??
      asInt(readField(node, "taskCount", "task_count")),
    timeEntryCount: asInt(readField(node, "timeEntryCount", "time_entry_count")),
  };
}

export function parseWorkloadView(payload: unknown): { rows: WorkloadRow[] } | null {
  const data = unwrapData(payload);
  const list = Array.isArray(data)
    ? data
    : isRecord(data) && Array.isArray(data.items)
      ? data.items
      : isRecord(data) && Array.isArray(data.assignees)
        ? data.assignees
        : isRecord(data) && Array.isArray(data.members)
          ? data.members
          : isRecord(payload) && Array.isArray((payload as Record<string, unknown>).data)
            ? ((payload as Record<string, unknown>).data as unknown[])
            : null;
  if (!list) return null;
  return { rows: list.map(parseWorkloadRow).filter((row): row is WorkloadRow => row !== null) };
}

/**
 * Parses POST /invitations. Requires `emailSent` and a minimal invitation
 * identity. Explicitly drops any raw `token` so it never reaches callers.
 */
export function parseCreateInvitationResult(payload: unknown): CreateInvitationResult | null {
  const root = isRecord(unwrapData(payload)) ? (unwrapData(payload) as Record<string, unknown>) : null;
  if (!root) return null;
  const emailSent = asBoolean(root.emailSent);
  if (typeof emailSent !== "boolean") return null;
  const invitationNode = isRecord(root.invitation) ? root.invitation : null;
  if (!invitationNode) return null;
  const id = asString(invitationNode.id);
  const email = asString(invitationNode.email);
  if (!id || !email) return null;
  return {
    invitation: { id, email },
    emailSent,
  };
}
