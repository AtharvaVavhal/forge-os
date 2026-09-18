"use client";

import { QueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/features/auth/api/classify-auth-error";

export function clearClientAuthState(queryClient: QueryClient): void {
  queryClient.clear();
}

function isPortalPath(pathname: string): boolean {
  return pathname === "/portal" || pathname.startsWith("/portal/");
}

/**
 * Session expiry UX (Doc B3 §4): drop client server-state and send the user
 * to the correct auth plane login. Never writes tokens to storage — cookies
 * are httpOnly and already invalid server-side.
 *
 * Staff → `/login?expired=1`
 * Portal → `/portal/login?reason=session_expired`
 */
export function expireClientSession(
  queryClient: QueryClient,
  navigation?: Pick<Location, "pathname" | "assign">
): void {
  clearClientAuthState(queryClient);
  const location = navigation ?? (typeof window === "undefined" ? null : window.location);
  if (!location) return;

  if (isPortalPath(location.pathname)) {
    if (location.pathname === "/portal/login") return;
    location.assign("/portal/login?reason=session_expired");
    return;
  }

  if (location.pathname === "/login") return;
  location.assign("/login?expired=1");
}

export function redirectToLoginIfUnauthorized(
  error: unknown,
  queryClient: QueryClient
): boolean {
  if (!isUnauthorizedError(error)) return false;
  expireClientSession(queryClient);
  return true;
}
