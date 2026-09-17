import "server-only";

import { serverApiGet } from "@/lib/api/server-request";
import type { InternalAuthContext } from "../types";
import { AUTH_PATHS } from "./auth-paths";
import { readAuthContextFromEndpoints } from "./resolve-auth-context";

export async function fetchAuthContextFromServer(): Promise<InternalAuthContext> {
  return readAuthContextFromEndpoints(serverApiGet, AUTH_PATHS);
}
