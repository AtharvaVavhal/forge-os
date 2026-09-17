/**
 * Portal-specific `@Throttle()` overrides (Document 5 §11 support
 * rate-limit; Document 6 §14 portal login boundary). Same test-mode
 * multiplier pattern as `modules/auth/rate-limits.ts`.
 */

const TEST_MODE_MULTIPLIER = process.env.NODE_ENV === "test" ? 10 : 1;

function throttleConfig(
  limitEnvVar: string,
  windowSecondsEnvVar: string,
  defaultLimit: number,
  defaultWindowSeconds: number
) {
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

export const portalLoginThrottle = () =>
  throttleConfig("RATE_LIMIT_PORTAL_LOGIN_MAX", "RATE_LIMIT_PORTAL_LOGIN_WINDOW_SECONDS", 5, 60);

export const portalSupportTicketThrottle = () =>
  throttleConfig(
    "RATE_LIMIT_PORTAL_SUPPORT_MAX",
    "RATE_LIMIT_PORTAL_SUPPORT_WINDOW_SECONDS",
    10,
    60
  );
