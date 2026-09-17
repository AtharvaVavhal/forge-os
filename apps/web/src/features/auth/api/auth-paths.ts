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
  passwordResetRequest: "auth/password-reset/request",
  passwordResetConfirm: "auth/password-reset/confirm",
  onboardingComplete: "auth/onboarding/complete",
} as const;

export const INVITATION_PATHS = {
  preview: "invitations/preview",
  accept: "invitations/accept",
} as const;
