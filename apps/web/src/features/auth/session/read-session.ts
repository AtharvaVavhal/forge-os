import { ApiClientError } from "@forge/api-client";
import { cookies } from "next/headers";
import { fetchAuthContextFromServer } from "../api/auth-api.server";
import { isUnauthorizedError } from "../api/classify-auth-error";
import type { InternalAuthContext } from "../types";

export type AuthReadResult =
  | { status: "authenticated"; context: InternalAuthContext }
  | { status: "unauthenticated" }
  | { status: "unavailable"; error: unknown };

/**
 * Reads the current internal session via documented `/auth/me` (or
 * `/auth/session` fallback). Returns a classified result so callers can
 * redirect, render, or surface an error without inventing backend behavior.
 *
 * No cookies at all → unauthenticated without calling the API (the session
 * cookie is httpOnly and required). A network failure *with* a cookie is
 * unavailable, not a silent login redirect.
 */
export async function readAuthContext(): Promise<AuthReadResult> {
  const cookieStore = await cookies();
  if (!cookieStore.toString()) {
    return { status: "unauthenticated" };
  }

  try {
    const context = await fetchAuthContextFromServer();
    if (!context.user.active) {
      return { status: "unauthenticated" };
    }
    return { status: "authenticated", context };
  } catch (error) {
    if (isUnauthorizedError(error)) {
      return { status: "unauthenticated" };
    }
    if (error instanceof ApiClientError && error.status === 403) {
      return { status: "unauthenticated" };
    }
    return { status: "unavailable", error };
  }
}
