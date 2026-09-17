import { ApiClientError, ApiNetworkError } from "@forge/api-client";

/**
 * Login UI states required by Phase 1. Exact `error.code` values are not
 * enumerated in Document 5, so classification is a frontend recognition
 * layer over HTTP status (authoritative) plus a small set of code strings
 * the backend may send for inactive accounts. Unknown codes never invent
 * a more specific failure than the status allows.
 */
export type LoginFailureKind =
  | "invalid_credentials"
  | "inactive_account"
  | "rate_limited"
  | "network"
  | "generic";

const INACTIVE_ACCOUNT_CODES = new Set([
  "ACCOUNT_INACTIVE",
  "USER_INACTIVE",
  "INACTIVE_ACCOUNT",
  "INACTIVE_USER",
  "AUTH_ACCOUNT_INACTIVE",
]);

export function classifyLoginFailure(error: unknown): LoginFailureKind {
  if (error instanceof ApiNetworkError || isNamedError(error, "ApiNetworkError")) {
    return "network";
  }

  if (error instanceof ApiClientError) {
    const code = error.code.toUpperCase();
    if (error.status === 429 || code.includes("RATE_LIMIT")) {
      return "rate_limited";
    }
    if (INACTIVE_ACCOUNT_CODES.has(code) || code.includes("INACTIVE")) {
      return "inactive_account";
    }
    if (error.status === 401 || error.status === 403) {
      return "invalid_credentials";
    }
    return "generic";
  }

  return "generic";
}

export function loginFailureMessage(kind: LoginFailureKind): string {
  switch (kind) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "inactive_account":
      return "This account is inactive. Contact a founder admin if you still need access.";
    case "rate_limited":
      return "Too many sign-in attempts. Wait a moment and try again.";
    case "network":
      return "We couldn’t reach the authentication service. Check your connection and try again.";
    default:
      return "Sign-in didn’t complete. Try again.";
  }
}

export function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function isForbiddenError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === name;
}
