import "server-only";

import { serverApiGet } from "@/lib/api/server-request";
import { parsePortalClientUser } from "./parse";
import { portalPaths } from "./portal-paths";
import type { PortalClientUser } from "../types";

export async function fetchPortalMeFromServer(): Promise<PortalClientUser | null> {
  const raw = await serverApiGet<unknown>(portalPaths.me);
  return parsePortalClientUser(raw);
}
