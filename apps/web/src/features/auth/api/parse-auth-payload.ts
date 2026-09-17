import { USER_ROLES, type UserRole } from "@forge/types";
import type { InternalAuthContext, InternalUser } from "../types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function unwrapPayload(payload: unknown): Record<string, unknown> | null {
  if (!isRecord(payload)) return null;
  if (isRecord(payload.data)) return payload.data;
  return payload;
}

function readUserNode(payload: Record<string, unknown>): Record<string, unknown> | null {
  if (isRecord(payload.user)) return payload.user;
  if (isRecord(payload.session) && isRecord(payload.session.user)) {
    return payload.session.user;
  }
  return payload;
}

function parsePermissionList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const permissions = value.filter((item): item is string => typeof item === "string");
  return permissions;
}

function parseUser(node: Record<string, unknown>): InternalUser | null {
  const id = asString(node.id) ?? asString(node.userId);
  const email = asString(node.email);
  const name = asString(node.name) ?? email;
  const role = node.role;
  const organizationId =
    asString(node.organizationId) ?? asString(node.organization_id) ?? null;
  const active = typeof node.active === "boolean" ? node.active : true;
  const onboardedAt =
    asString(node.onboardedAt) ?? asString(node.onboarded_at) ?? null;

  if (!id || !email || !isUserRole(role)) {
    return null;
  }

  return {
    id,
    organizationId,
    email,
    name: name ?? email,
    role,
    active,
    onboardedAt,
  };
}

/**
 * Accepts several documented-but-unspecified envelope shapes without inventing
 * fields: `{ user, permissions }`, `{ data: user }`, a bare user object, or a
 * session wrapper. Returns null when the payload cannot be recognized.
 */
export function parseAuthContext(payload: unknown): InternalAuthContext | null {
  const root = unwrapPayload(payload);
  if (!root) return null;

  const userNode = readUserNode(root);
  if (!userNode) return null;

  const user = parseUser(userNode);
  if (!user) return null;

  const permissions =
    parsePermissionList(root.permissions) ??
    parsePermissionList(userNode.permissions) ??
    (isRecord(root.session) ? parsePermissionList(root.session.permissions) : undefined);

  return { user, permissions };
}
