import { redirect } from "next/navigation";
import { readAuthContext } from "./read-session";
import type { InternalAuthContext } from "../types";

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

  return result.context;
}

export async function redirectIfAuthenticated(to = "/dashboard"): Promise<void> {
  const result = await readAuthContext();
  if (result.status === "authenticated") {
    redirect(to);
  }
}
