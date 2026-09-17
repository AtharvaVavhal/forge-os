import type { UserRole } from "@forge/types";

/**
 * Provisional internal-user shape for Phase 1 UI.
 *
 * Document 5 lists `GET /auth/me` output as "user+role" and `/auth/session`
 * as "session", without a frozen DTO. Fields below are taken from the frozen
 * `User` model (id, organization, email, name, role, active) plus the
 * optional permissions array Document 5 names on `/auth/me` and
 * `/auth/permissions`. Unknown extras are ignored. This is a frontend
 * integration boundary, not a claim that the backend JSON looks exactly like
 * this on day one.
 *
 * Internal `User` only — never a `ClientUser` / portal identity (Doc B3 §4).
 */
export interface InternalUser {
  id: string;
  organizationId: string | null;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  /** ISO timestamp when first-run onboarding completed; null if not yet. */
  onboardedAt: string | null;
}

export interface InternalAuthContext {
  user: InternalUser;
  /**
   * Effective permission strings from the backend (`resource.action`).
   * `undefined` means the payload did not include them yet — UI must fail
   * closed on permission checks and may still gate on `user.role`.
   */
  permissions: string[] | undefined;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export const SESSION_COOKIE_NAME = "forge_session";
