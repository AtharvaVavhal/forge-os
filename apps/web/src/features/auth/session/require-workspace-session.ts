import { redirect } from "next/navigation";
import { readAuthContext } from "./read-session";
import type { InternalAuthContext } from "../types";

function postAuthPath(context: InternalAuthContext): string {
  return context.user.onboardedAt ? "/dashboard" : "/onboarding";
}

export async function requireWorkspaceSession(): Promise<InternalAuthContext> {
  const result = await readAuthContext();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (result.status === "unavailable") {
    throw result.error instanceof Error
      ? result.error
      : new Error("Authentication service is unavailable.");
  }

  if (!result.context.user.onboardedAt) {
    redirect("/onboarding");
  }

  return result.context;
}

/** Authenticated but not yet onboarded — for `/onboarding` only. */
export async function requireOnboardingSession(): Promise<InternalAuthContext> {
  const result = await readAuthContext();

  if (result.status === "unauthenticated") {
    redirect("/login");
  }

  if (result.status === "unavailable") {
    throw result.error instanceof Error
      ? result.error
      : new Error("Authentication service is unavailable.");
  }

  if (result.context.user.onboardedAt) {
    redirect("/dashboard");
  }

  return result.context;
}

export async function redirectIfAuthenticated(to = "/dashboard"): Promise<void> {
  const result = await readAuthContext();
  if (result.status === "authenticated") {
    redirect(result.context.user.onboardedAt ? to : "/onboarding");
  }
}

/** Invite Gate: send signed-in users to the right destination. */
export async function redirectIfAuthenticatedOnboardingAware(): Promise<void> {
  const result = await readAuthContext();
  if (result.status === "authenticated") {
    redirect(postAuthPath(result.context));
  }
}
