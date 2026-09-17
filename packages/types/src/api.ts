/**
 * API contract types — mirrors Document 5 (Backend/API Specification) §2.4 and §2.8
 * exactly. These are the ONLY generic, cross-cutting API shapes defined in this
 * package for Phase 0. Entity-specific request/response DTOs are added per-feature
 * in later implementation phases, once each domain module is actually built —
 * inventing them now would be inventing behavior ahead of the endpoints that don't
 * exist yet (Phase 0 explicitly forbids implementing domain modules).
 */

/**
 * `error.code` is intentionally typed as `string`, not a closed union. Document 5
 * gives exactly one concrete example (`DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL`) but does
 * not enumerate the full set of codes anywhere — treating this as a closed union
 * would be inventing values that aren't frozen. Widen this to a real union only once
 * the backend's actual code list is documented.
 */
export type ApiErrorCode = string;

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  details?: unknown;
  requestId: string;
}

export interface ApiErrorEnvelope {
  error: ApiError;
}

export type PaginationMode = "cursor" | "offset";

export interface PaginationMeta {
  pagination: {
    mode: PaginationMode;
    /** Cursor mode only. */
    limit?: number;
    /** Cursor mode only; null when there is no further page. */
    nextCursor?: string | null;
    /** Offset mode only, 1-based. */
    page?: number;
    /** Offset mode only. */
    pageSize?: number;
    /** Optional even in offset mode per Doc 5 §2.4. */
    total?: number;
  };
}

export interface ApiListResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

/** The four HTTP status codes Document 5 §2.8 gives explicit meaning to, beyond the
 * standard 400/401/403/404/429/500 set. Kept here only as documentation — callers
 * branch on `error.code`, never on these numbers alone. */
export const SEMANTIC_HTTP_STATUS = {
  CONFLICT: 409,
  BUSINESS_RULE_FAILURE: 422,
} as const;
