import type { ApiErrorEnvelope } from "@forge/types";
import { ApiClientError, ApiNetworkError } from "./errors";

export type HttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  /**
   * Sets the `Idempotency-Key` header (Doc 5 §2.7). The client never decides
   * *which* endpoints require this on its own — that's business knowledge
   * belonging to each feature module, not generic infrastructure. Callers
   * that know they're hitting one of the financial POSTs Doc 5 §2.7 names
   * pass a key (a fresh UUID per submit attempt); everything else omits it.
   */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export interface ApiClientConfig {
  /** e.g. `https://app.forgebuilds.in/api/v1` or `http://localhost:4000/api/v1` */
  baseUrl: string;
  /**
   * Returns a fresh request id per call. Defaults to `crypto.randomUUID()`.
   * Overridable so server-side callers (a Next.js Server Component/Route
   * Handler) can forward an inbound request id instead of minting a new one.
   */
  requestIdFactory?: () => string;
}

function buildUrl(baseUrl: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

/**
 * The one place a Next.js component/hook is allowed to construct a `fetch`
 * call against the Business OS API (Doc B3 §6/§7 — "no direct fetch logic
 * scattered across feature components"). Deliberately generic: no
 * entity-specific methods, no assumed DTO shapes.
 */
export function createApiClient(config: ApiClientConfig) {
  const requestId = config.requestIdFactory ?? (() => crypto.randomUUID());

  async function request<TResponse>(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {}
  ): Promise<TResponse> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Request-Id": requestId(),
    };
    if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

    let body: string | undefined;
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await fetch(buildUrl(config.baseUrl, path, options.query), {
        method,
        headers,
        body,
        // httpOnly session cookies (`forge_session` / `portal_session`, Doc 6 §5)
        // travel automatically with same-site requests — the client never reads
        // or attaches a token itself.
        credentials: "include",
        signal: options.signal,
      });
    } catch (cause) {
      throw new ApiNetworkError(cause);
    }

    if (response.status === 204) {
      return undefined as TResponse;
    }

    const text = await response.text();
    const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

    if (!response.ok) {
      const envelope = json as Partial<ApiErrorEnvelope> | undefined;
      if (envelope?.error) {
        throw new ApiClientError(response.status, envelope.error);
      }
      // Backend didn't return the documented envelope (a 5xx from in front of
      // the app, a proxy error page, etc.) — surface a minimal, honest error
      // rather than throwing away the HTTP status.
      throw new ApiClientError(response.status, {
        code: "UNKNOWN_ERROR",
        message: `Request failed with status ${response.status}.`,
        requestId: response.headers.get("x-request-id") ?? "",
      });
    }

    return json as TResponse;
  }

  return {
    get: <TResponse>(path: string, options?: Omit<RequestOptions, "body">) =>
      request<TResponse>("GET", path, options),
    post: <TResponse>(path: string, options?: RequestOptions) =>
      request<TResponse>("POST", path, options),
    patch: <TResponse>(path: string, options?: RequestOptions) =>
      request<TResponse>("PATCH", path, options),
    put: <TResponse>(path: string, options?: RequestOptions) =>
      request<TResponse>("PUT", path, options),
    delete: <TResponse>(path: string, options?: Omit<RequestOptions, "body">) =>
      request<TResponse>("DELETE", path, options),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
