import { ApiClientError } from "@forge/api-client";
import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import type { InternalAuthContext, LoginRequest } from "../types";
import { AUTH_PATHS } from "./auth-paths";
import { readAuthContextFromEndpoints } from "./resolve-auth-context";

export { AUTH_PATHS } from "./auth-paths";

export async function fetchAuthContextFromClient(): Promise<InternalAuthContext> {
  return readAuthContextFromEndpoints((path) => apiClient.get(path), AUTH_PATHS);
}

export async function loginWithPassword(input: LoginRequest): Promise<void> {
  await browserMutate("POST", AUTH_PATHS.login, {
    body: {
      email: input.email,
      password: input.password,
    },
  });
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
