import { ApiNetworkError } from "@forge/api-client";
import { getBrowserApiBaseUrl } from "./base-url";
import { CSRF_HEADER_NAME, readCsrfToken } from "./csrf";
import { parseApiResponse } from "./parse-response";

function joinUrl(baseUrl: string, path: string): string {
  const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL(path.replace(/^\//, ""), normalizedBase).toString();
}

/**
 * Browser mutations. Adds `X-CSRF-Token` when the server has issued
 * `forge_csrf`. GETs keep using `apiClient` (safe methods are CSRF-exempt).
 */
export async function browserMutate<T>(
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  path: string,
  options: { body?: unknown; idempotencyKey?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "X-Request-Id": crypto.randomUUID(),
  };
  const csrf = readCsrfToken();
  if (csrf) headers[CSRF_HEADER_NAME] = csrf;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let body: string | undefined;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(joinUrl(getBrowserApiBaseUrl(), path), {
      method,
      headers,
      body,
      credentials: "include",
    });
  } catch (cause) {
    throw new ApiNetworkError(cause);
  }

  return parseApiResponse<T>(response);
}
