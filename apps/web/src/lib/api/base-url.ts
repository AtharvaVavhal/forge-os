/**
 * Browser requests go same-origin (`/api/v1`) so the httpOnly `forge_session`
 * cookie (Document 6 §5) is first-party. `next.config.ts` rewrites that path
 * to the Nest API. Server Components talk to the API origin directly and
 * forward the Cookie header — they cannot rely on the browser's cookie jar.
 *
 * Documented auth paths live under `/api/v1/auth/*` (Document 5 §3.2 / §19).
 * This file does not invent endpoints; it only resolves the base URL.
 */

const DEFAULT_API_ORIGIN = "http://localhost:4000";
const API_PREFIX = "/api/v1";

function requireProductionApiBase(fromEnv: string | undefined): string {
  if (fromEnv && /^https?:\/\//.test(fromEnv)) {
    return fromEnv.replace(/\/$/, "");
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be set to an absolute URL in production.");
  }
  return `${DEFAULT_API_ORIGIN}${API_PREFIX}`;
}

export function getServerApiBaseUrl(): string {
  return requireProductionApiBase(process.env.NEXT_PUBLIC_API_BASE_URL);
}

export function getApiOrigin(): string {
  const base = getServerApiBaseUrl();
  try {
    return new URL(base).origin;
  } catch {
    if (process.env.NODE_ENV === "production") {
      throw new Error("NEXT_PUBLIC_API_BASE_URL must be a valid absolute URL in production.");
    }
    return DEFAULT_API_ORIGIN;
  }
}

export function getBrowserApiBaseUrl(): string {
  if (typeof window !== "undefined") {
    return `${window.location.origin}${API_PREFIX}`;
  }
  return getServerApiBaseUrl();
}

/** Documented Google Workspace SSO start path (Document 5 §3.2). Not an IdP URL. */
export function getGoogleWorkspaceStartPath(): string {
  return `${API_PREFIX}/auth/google/start`;
}
