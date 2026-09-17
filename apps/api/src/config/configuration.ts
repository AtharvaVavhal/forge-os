export interface AppConfig {
  env: "development" | "test" | "production";
  port: number;
  apiPrefix: string;
  cors: {
    origins: string[];
  };
  database: {
    url: string | undefined;
    appRole: string | undefined;
  };
  auth: {
    sessionJwtSigningKey: string;
    sessionJwtTtlSeconds: number;
    passwordHashCostFactor: number;
    passwordResetTokenTtlSeconds: number;
    invitationTokenTtlDays: number;
    /** When true (non-production), invitation create may return the raw token. */
    invitationExposeRawToken: boolean;
  };
  cookies: {
    /** Host-only cookie (no Domain attribute) unless explicitly configured
     * — Document 6 §5.2 item 5 leaves the exact Domain value open. */
    domain: string | undefined;
    secure: boolean;
  };
  storage: {
    /** Optional dedicated HMAC secret for upload/download URL signatures. */
    signingSecret: string | undefined;
  };
  google: {
    clientId: string | undefined;
    clientSecret: string | undefined;
    redirectUri: string | undefined;
    /** True only when all three of the above are actually set. */
    configured: boolean;
  };
  rateLimit: {
    login: { limit: number; ttlSeconds: number };
    invitationAccept: { limit: number; ttlSeconds: number };
    passwordReset: { limit: number; ttlSeconds: number };
  };
  razorpay: {
    keyId: string | undefined;
    keySecret: string | undefined;
    webhookSecret: string | undefined;
    /** True only when all three of the above are actually set. */
    configured: boolean;
    /** True when just the webhook secret is set — the webhook route can
     * verify signatures independently of order-creation being configured. */
    webhookConfigured: boolean;
  };
}

/**
 * Consumed via `ConfigService.get<T>('path.to.value')`. Kept as one small,
 * typed shape rather than scattering `process.env` reads across the app —
 * every later module reads config the same way. `env.validation.ts` has
 * already validated/defaulted everything read here by the time this runs.
 */
export default (): AppConfig => {
  const env = (process.env.NODE_ENV as AppConfig["env"]) ?? "development";
  const googleClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const googleRedirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  const corsOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  // B9: credentials are always enabled — reject wildcard / empty allowlists in production.
  if (env === "production") {
    if (corsOrigins.length === 0 || corsOrigins.some((o) => o === "*")) {
      throw new Error(
        "CORS_ORIGINS must be an explicit non-wildcard allowlist when NODE_ENV=production."
      );
    }
    if (process.env.COOKIE_SECURE === "false") {
      throw new Error("COOKIE_SECURE=false is not allowed when NODE_ENV=production.");
    }
  }

  return {
    env,
    port: parseInt(process.env.PORT ?? "4000", 10),
    // Frozen by Document 5 §2.1 — never change without updating the frozen spec.
    apiPrefix: "api/v1",
    cors: {
      origins: corsOrigins,
    },
    database: {
      url: process.env.DATABASE_URL,
      appRole: process.env.APP_DB_ROLE,
    },
    auth: {
      sessionJwtSigningKey: process.env.SESSION_JWT_SIGNING_KEY ?? "",
      sessionJwtTtlSeconds: parseInt(process.env.SESSION_JWT_TTL_SECONDS ?? "43200", 10),
      passwordHashCostFactor: parseInt(process.env.PASSWORD_HASH_COST_FACTOR ?? "12", 10),
      passwordResetTokenTtlSeconds: parseInt(
        process.env.PASSWORD_RESET_TOKEN_TTL_SECONDS ?? "1800",
        10
      ),
      invitationTokenTtlDays: parseInt(process.env.INVITATION_TOKEN_TTL_DAYS ?? "7", 10),
      // Production never returns raw invitation tokens over HTTP (B9 H2).
      invitationExposeRawToken: env !== "production",
    },
    cookies: {
      domain: process.env.COOKIE_DOMAIN,
      secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === "true"
        : env === "production",
    },
    storage: {
      signingSecret: process.env.STORAGE_SIGNING_SECRET || undefined,
    },
    google: {
      clientId: googleClientId,
      clientSecret: googleClientSecret,
      redirectUri: googleRedirectUri,
      configured: Boolean(googleClientId && googleClientSecret && googleRedirectUri),
    },
    rateLimit: {
      login: {
        limit: parseInt(process.env.RATE_LIMIT_LOGIN_MAX ?? "5", 10),
        ttlSeconds: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_SECONDS ?? "60", 10),
      },
      invitationAccept: {
        limit: parseInt(process.env.RATE_LIMIT_INVITATION_ACCEPT_MAX ?? "5", 10),
        ttlSeconds: parseInt(
          process.env.RATE_LIMIT_INVITATION_ACCEPT_WINDOW_SECONDS ?? "60",
          10
        ),
      },
      passwordReset: {
        limit: parseInt(process.env.RATE_LIMIT_PASSWORD_RESET_MAX ?? "3", 10),
        ttlSeconds: parseInt(
          process.env.RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS ?? "300",
          10
        ),
      },
    },
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID,
      keySecret: process.env.RAZORPAY_KEY_SECRET,
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET,
      configured: Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
      webhookConfigured: Boolean(process.env.RAZORPAY_WEBHOOK_SECRET),
    },
  };
};
