import { ApiClientError } from "@forge/api-client";
import { cookies } from "next/headers";
import { fetchAuthContextFromServer } from "../api/auth-api.server";
import { isUnauthorizedError } from "../api/classify-auth-error";
import { SESSION_COOKIE_NAME, type InternalAuthContext } from "../types";

export type AuthReadResult =
  | { status: "authenticated"; context: InternalAuthContext }
  | { status: "unauthenticated" }
  | { status: "unavailable"; error: unknown };

/**
 * Reads the current internal session via documented `/auth/me` (or
 * `/auth/session` fallback). Returns a classified result so callers can
 * redirect, render, or surface an error without inventing backend behavior.
 *
 * No `forge_session` cookie → unauthenticated without calling the API.
 * A network failure *with* a session cookie is unavailable, not a silent
 * login redirect. Does not treat `portal_session` as workspace auth.
 */
export async function readAuthContext(): Promise<AuthReadResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE_NAME);
  if (!sessionCookie?.value) {
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
