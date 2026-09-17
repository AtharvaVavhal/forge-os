/**
 * Base exception for business-rule and known-failure responses. Feature
 * modules (Phase 1+) throw `AppError` (or a small subclass) instead of a
 * raw `HttpException`, so every error the API returns — however it
 * originated — passes through `AllExceptionsFilter` into the one frozen
 * envelope shape from Document 5 §2.8:
 *
 *   { error: { code, message, details, requestId } }
 *
 * This class carries no domain knowledge itself (no CRM/Finance/etc. error
 * codes are defined here) — it's infrastructure for *how* an error is
 * reported, not *which* errors exist. Concrete codes (e.g.
 * `DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL`, Doc 5 §2.8's own example) belong
 * to the module that owns that rule, once that module is implemented.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AppError";
  }
}
