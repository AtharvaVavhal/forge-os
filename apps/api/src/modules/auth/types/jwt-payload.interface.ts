import type { UserRole } from "@prisma/client";

/**
 * The `forge_session` cookie's JWT payload. `aud` discriminates this from
 * a portal token (Document 6 §1.1/§5.1 — internal `aud: internal`, portal
 * `aud: portal`) — an internal guard must reject anything without this
 * exact audience, and this codebase never issues or validates a portal
 * token at all (that identity plane isn't implemented in this phase).
 *
 * `iatMs` is a custom, millisecond-precision issue timestamp — deliberately
 * *not* the standard JWT `iat` claim, which RFC 7519 fixes at whole-second
 * resolution. The security-stamp fence (comparing issue time against
 * `User.updated_at`, see jwt-auth.guard.ts) needs finer-than-one-second
 * resolution: a token is routinely minted and then immediately consumed
 * (e.g. login mints a session in the same request that just bumped
 * `last_login_at`) well within the same wall-clock second, and a
 * whole-second comparison cannot reliably tell "issued before this
 * update" apart from "issued in the same second as this update" — either
 * choice of comparison direction produces either false accepts of a
 * replayed/stale token or false rejects of a legitimately fresh one. This
 * was caught by a genuinely flaky-looking e2e test failure during Phase 1
 * (not a test bug — see docs/IMPLEMENTATION-PHASE-1.md), not designed in
 * from the start.
 */
export interface InternalSessionPayload {
  sub: string; // User.id
  org: string; // User.organization_id
  role: UserRole;
  aud: "internal";
  iatMs: number;
  iat: number;
  exp: number;
}

/**
 * A short-lived, non-persisted password-reset token (Document 6 §7 — no
 * `PasswordResetToken` table exists in the frozen schema; a signed token
 * is the sanctioned alternative, see password-reset.service.ts for the
 * single-use mechanism). A distinct `aud` value prevents this token from
 * ever being accepted where a real session is expected, or vice versa.
 * `iatMs` — see `InternalSessionPayload` above.
 */
export interface PasswordResetTokenPayload {
  sub: string; // User.id
  aud: "internal-password-reset";
  iatMs: number;
  iat: number;
  exp: number;
}
