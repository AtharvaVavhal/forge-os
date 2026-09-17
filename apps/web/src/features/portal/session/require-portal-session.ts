import { redirect } from "next/navigation";
import { readPortalSession } from "./read-portal-session";
import type { PortalAuthContext } from "../types";

export async function requirePortalSession(): Promise<PortalAuthContext> {
  const result = await readPortalSession();

  if (result.status === "unauthenticated") {
    redirect("/portal/login");
  }

  if (result.status === "unavailable") {
    throw result.error instanceof Error
      ? result.error
      : new Error("Portal authentication service is unavailable.");
  }

  return result.context;
}

export async function redirectIfPortalAuthenticated(to = "/portal"): Promise<void> {
  const result = await readPortalSession();
  if (result.status === "authenticated") {
    redirect(to);
  }
}
