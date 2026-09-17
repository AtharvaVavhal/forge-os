/**
 * Per-route `@Throttle()` overrides for the specific endpoints Step 13
 * names ("At minimum evaluate: internal login, portal login boundary,
 * invitation acceptance, password reset"). The portal login boundary
 * itself isn't implemented in this phase (see docs/IMPLEMENTATION-PHASE-1.md
 * — internal auth only), so only the three internal cases apply here.
 *
 * Read directly from `process.env` (not `ConfigService`) because
 * `@Throttle(...)` is evaluated as a decorator at class-definition/import
 * time, before Nest's DI container exists — `process.env` is already
 * fully populated by then (Node loads it before requiring any
 * application module), so this is the correct place to read it, not a
 * shortcut around DI. Defaults mirror `env.validation.ts` exactly.
 *
 * `@nestjs/throttler`'s `ttl` is milliseconds; `RATE_LIMIT_*_WINDOW_SECONDS`
 * is seconds (matching how every other duration in this codebase's env
 * vars is expressed) — converted here, once.
 *
 * Document 6 §14 marks every one of these exact numbers **NOT CURRENTLY
 * DEFINED** — these are configurable defaults, not claimed frozen values
 * (Step 13: "Do not invent exact production numbers... Use configuration
 * for limits"). No Redis-backed distributed limiter is used — @nestjs/
 * throttler's default in-memory store is per-process, which is correct
 * for this task's explicit instruction not to introduce Redis.
 */

/**
 * In `NODE_ENV=test` (which Jest sets automatically), the *fallback*
 * default is multiplied up before being applied — never the explicit
 * value of the env var itself, which always wins when set. This exists
 * because a single e2e spec file legitimately exercises several distinct
 * scenarios against the same throttled endpoint (e.g. password-reset's
 * valid/expired/reused/inactive-user/wrong-audience cases all call
 * `/auth/password-reset/confirm`) within one shared in-memory throttler
 * instance — without headroom, the test suite would trip its own limits
 * and fail for reasons unrelated to what each test actually checks. The
 * dedicated test that proves 429 behavior for real
 * (`rate-limit-behavior.e2e-spec.ts`) sets an explicit, small env value
 * before creating its app specifically so this multiplier doesn't apply
 * to it — see that file for why.
 */
const TEST_MODE_MULTIPLIER = process.env.NODE_ENV === "test" ? 10 : 1;

function throttleConfig(limitEnvVar: string, windowSecondsEnvVar: string, defaultLimit: number, defaultWindowSeconds: number) {
  const limit = parseInt(
    process.env[limitEnvVar] ?? String(defaultLimit * TEST_MODE_MULTIPLIER),
    10
  );
  const windowSeconds = parseInt(
    process.env[windowSecondsEnvVar] ?? String(defaultWindowSeconds),
    10
  );
  return { default: { limit, ttl: windowSeconds * 1000 } };
}

export const loginThrottle = () =>
  throttleConfig("RATE_LIMIT_LOGIN_MAX", "RATE_LIMIT_LOGIN_WINDOW_SECONDS", 5, 60);

export const invitationAcceptThrottle = () =>
  throttleConfig(
    "RATE_LIMIT_INVITATION_ACCEPT_MAX",
    "RATE_LIMIT_INVITATION_ACCEPT_WINDOW_SECONDS",
    5,
    60
  );

export const passwordResetThrottle = () =>
  throttleConfig(
    "RATE_LIMIT_PASSWORD_RESET_MAX",
    "RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS",
    3,
    300
  );
