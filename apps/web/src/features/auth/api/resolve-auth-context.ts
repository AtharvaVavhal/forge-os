import { ApiClientError } from "@forge/api-client";
import type { InternalAuthContext } from "../types";
import { parseAuthContext } from "./parse-auth-payload";

export function asAuthContext(payload: unknown, source: string): InternalAuthContext {
  const parsed = parseAuthContext(payload);
  if (!parsed) {
    throw new Error(`Authentication payload from ${source} could not be read.`);
  }
  return parsed;
}

export async function mergePermissions(
  context: InternalAuthContext,
  readPermissions: () => Promise<unknown>
): Promise<InternalAuthContext> {
  if (context.permissions) return context;

  try {
    const payload = await readPermissions();
    const fromList = parseAuthContext(
      typeof payload === "object" && payload !== null
        ? { ...context.user, permissions: extractPermissionArray(payload) }
        : payload
    );
    return {
      ...context,
      permissions: fromList?.permissions ?? extractPermissionArray(payload),
    };
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return context;
    }
    throw error;
  }
}

function extractPermissionArray(payload: unknown): string[] | undefined {
  if (Array.isArray(payload) && payload.every((item) => typeof item === "string")) {
    return payload;
  }
  if (typeof payload === "object" && payload !== null && "permissions" in payload) {
    const value = (payload as { permissions: unknown }).permissions;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) {
      return value;
    }
  }
  if (typeof payload === "object" && payload !== null && "data" in payload) {
    return extractPermissionArray((payload as { data: unknown }).data);
  }
  return undefined;
}

export async function readAuthContextFromEndpoints(
  get: <T>(path: string) => Promise<T>,
  paths: { me: string; session: string; permissions: string }
): Promise<InternalAuthContext> {
  try {
    const me = await get<unknown>(paths.me);
    return mergePermissions(asAuthContext(me, paths.me), () => get<unknown>(paths.permissions));
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      const session = await get<unknown>(paths.session);
      return asAuthContext(session, paths.session);
    }
    throw error;
  }
}
