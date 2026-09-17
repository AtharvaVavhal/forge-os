import { ApiClientError } from "@forge/api-client";
import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import type { InternalAuthContext, InternalUser, LoginRequest } from "../types";
import { AUTH_PATHS, INVITATION_PATHS } from "./auth-paths";
import { parseAuthContext } from "./parse-auth-payload";
import { readAuthContextFromEndpoints } from "./resolve-auth-context";

export { AUTH_PATHS, INVITATION_PATHS } from "./auth-paths";

export async function fetchAuthContextFromClient(): Promise<InternalAuthContext> {
  return readAuthContextFromEndpoints((path) => apiClient.get(path), AUTH_PATHS);
}

export async function loginWithPassword(input: LoginRequest): Promise<InternalUser> {
  const payload = await browserMutate<unknown>("POST", AUTH_PATHS.login, {
    body: {
      email: input.email,
      password: input.password,
    },
  });
  const parsed = parseAuthContext(payload);
  if (!parsed) {
    throw new Error("Login succeeded but the session payload could not be read.");
  }
  return parsed.user;
}

export async function logoutCurrentSession(): Promise<void> {
  try {
    await browserMutate("POST", AUTH_PATHS.logout);
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 401) {
      return;
    }
    throw error;
  }
}

/** Public — always 204; does not reveal whether the email exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  await browserMutate("POST", AUTH_PATHS.passwordResetRequest, {
    body: { email },
  });
}

/** Public — confirms with the short-lived password-reset token from email. */
export async function confirmPasswordReset(token: string, password: string): Promise<void> {
  await browserMutate("POST", AUTH_PATHS.passwordResetConfirm, {
    body: { token, password },
  });
}

export async function completeOnboarding(): Promise<InternalUser> {
  const payload = await browserMutate<unknown>("POST", AUTH_PATHS.onboardingComplete);
  const parsed = parseAuthContext(payload);
  if (!parsed) {
    throw new Error("Onboarding completion payload could not be read.");
  }
  return parsed.user;
}

export interface InvitationPreview {
  email: string;
  role: InternalUser["role"];
  inviterName: string | null;
  organizationName: string;
}

export async function previewInvitation(token: string): Promise<InvitationPreview> {
  return browserMutate<InvitationPreview>("POST", INVITATION_PATHS.preview, {
    body: { token },
  });
}

/** Creates the User row (password optional — omitted for Google Workspace journey). */
export async function acceptInvitation(token: string): Promise<void> {
  await browserMutate("POST", INVITATION_PATHS.accept, {
    body: { token },
  });
}
