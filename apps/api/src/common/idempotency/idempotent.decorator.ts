import { SetMetadata } from "@nestjs/common";

export const IDEMPOTENT_KEY = "isIdempotent";

/**
 * Marks a route as honoring `Idempotency-Key` (Document 5 §2.7). Checked
 * by the global `IdempotencyInterceptor` — routes without this decorator
 * are untouched by it (the interceptor's own first check is a no-op).
 */
export const Idempotent = () => SetMetadata(IDEMPOTENT_KEY, true);
