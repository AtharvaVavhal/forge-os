/**
 * Documented internal auth paths (Document 5 §3.2 / §19). Paths only —
 * no invented routes, no OAuth provider URLs.
 */
export const AUTH_PATHS = {
  login: "auth/login",
  logout: "auth/logout",
  session: "auth/session",
  me: "auth/me",
  permissions: "auth/permissions",
} as const;
