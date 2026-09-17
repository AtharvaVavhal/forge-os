import { ApiClientError } from "@forge/api-client";
import { cookies } from "next/headers";
import { isPortalUnauthorizedError } from "../api/classify-portal-error";
import { fetchPortalMeFromServer } from "../api/portal-api.server";
import { PORTAL_SESSION_COOKIE_NAME, type PortalAuthContext } from "../types";

export type PortalSessionReadResult =
  | { status: "authenticated"; context: PortalAuthContext }
  | { status: "unauthenticated" }
  | { status: "unavailable"; error: unknown };

/**
 * Reads the current portal session via documented `/portal/me`.
 * Returns a classified result so callers can redirect, render, or surface an error
 * without inventing backend behavior.
 *
 * CRITICAL:
 * Does NOT check `forge_session` (internal workspace).
 * Only checks `portal_session` (client portal plane).
 */
export async function readPortalSession(): Promise<PortalSessionReadResult> {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(PORTAL_SESSION_COOKIE_NAME);

  if (!sessionCookie || !sessionCookie.value) {
    return { status: "unauthenticated" };
  }

  try {
    const clientUser = await fetchPortalMeFromServer();
    if (!clientUser || !clientUser.active) {
      return { status: "unauthenticated" };
    }
    return { status: "authenticated", context: { clientUser } };
  } catch (error) {
    if (isPortalUnauthorizedError(error)) {
      return { status: "unauthenticated" };
    }
    if (error instanceof ApiClientError && error.status === 403) {
      return { status: "unauthenticated" };
    }
    return { status: "unavailable", error };
  }
}
