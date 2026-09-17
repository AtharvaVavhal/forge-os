import { ApiClientError, ApiNetworkError } from "@forge/api-client";

export type PortalLoginFailureKind =
  | "invalid_credentials"
  | "inactive_account"
  | "rate_limited"
  | "network"
  | "generic";

const INACTIVE_ACCOUNT_CODES = new Set([
  "ACCOUNT_INACTIVE",
  "USER_INACTIVE",
  "CLIENT_INACTIVE",
  "INACTIVE_ACCOUNT",
  "INACTIVE_CLIENT",
  "AUTH_ACCOUNT_INACTIVE",
]);

export function classifyPortalLoginFailure(error: unknown): PortalLoginFailureKind {
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

export function portalLoginFailureMessage(kind: PortalLoginFailureKind): string {
  switch (kind) {
    case "invalid_credentials":
      return "Invalid email or password.";
    case "inactive_account":
      return "This portal account is inactive. Please contact your account manager.";
    case "rate_limited":
      return "Too many sign-in attempts. Please wait a moment and try again.";
    case "network":
      return "Unable to reach the portal service. Check your connection and try again.";
    default:
      return "Sign-in could not be completed. Please try again.";
  }
}

export function isPortalUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 401;
}

export function isPortalForbiddenError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 403;
}

export function isPortalNotFoundError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

function isNamedError(error: unknown, name: string): boolean {
  return typeof error === "object" && error !== null && (error as { name?: string }).name === name;
}
