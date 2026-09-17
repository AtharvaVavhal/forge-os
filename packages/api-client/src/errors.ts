import type { ApiError } from "@forge/types";

/**
 * Thrown for every non-2xx response the client parses. Callers branch on
 * `.code`, per Document 5 §2.8 and Document B3 §6 — never on `.message`,
 * which is human copy and may change without notice.
 */
export class ApiClientError extends Error {
  readonly status: number;
  readonly code: ApiError["code"];
  readonly details: unknown;
  readonly requestId: string | undefined;

  constructor(status: number, error: ApiError) {
    super(error.message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.requestId;
  }
}

/**
 * Thrown when the request never reached the server at all (DNS failure, the
 * network is down, CORS rejection before a response body exists) — a
 * distinct failure mode from `ApiClientError`, because "you're offline" and
 * "the server said no" need different UI (Doc B3 §19).
 */
export class ApiNetworkError extends Error {
  constructor(cause: unknown) {
    super("The request could not be sent — check your connection and try again.", { cause });
    this.name = "ApiNetworkError";
  }
}
