"use client";

import { QueryClient } from "@tanstack/react-query";
import { isUnauthorizedError } from "@/features/auth/api/classify-auth-error";

export function clearClientAuthState(queryClient: QueryClient): void {
  queryClient.clear();
}

/**
 * Session expiry UX (Doc B3 §4): drop client server-state and send the user
 * to `/login?expired=1`. Never writes tokens to storage — the cookie is
 * httpOnly and already invalid server-side.
 */
export function expireClientSession(
  queryClient: QueryClient,
  navigation?: Pick<Location, "pathname" | "assign">
): void {
  clearClientAuthState(queryClient);
  const location = navigation ?? (typeof window === "undefined" ? null : window.location);
  if (!location) return;
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
