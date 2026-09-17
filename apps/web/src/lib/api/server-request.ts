import "server-only";

import { ApiNetworkError } from "@forge/api-client";
import { cookies } from "next/headers";
import { getServerApiBaseUrl } from "./base-url";
import { parseApiResponse } from "./parse-response";

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

/**
 * Server-only GET against the typed API. Forwards the incoming Cookie header
 * so `forge_session` is presented to the backend. Extra headers are not on
 * `@forge/api-client`'s RequestOptions, so this wrapper exists as the
 * server integration boundary rather than a new public endpoint.
 */
export async function serverApiGet<T>(path: string): Promise<T> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  let response: Response;
  try {
    response = await fetch(joinUrl(getServerApiBaseUrl(), path), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "X-Request-Id": crypto.randomUUID(),
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      cache: "no-store",
      credentials: "include",
    });
  } catch (cause) {
    throw new ApiNetworkError(cause);
  }

  return parseApiResponse<T>(response);
}
