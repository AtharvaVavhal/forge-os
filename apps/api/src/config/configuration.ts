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
  };
  cookies: {
    /** Host-only cookie (no Domain attribute) unless explicitly configured
     * — Document 6 §5.2 item 5 leaves the exact Domain value open. */
    domain: string | undefined;
    secure: boolean;
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

  return {
    env,
    port: parseInt(process.env.PORT ?? "4000", 10),
    // Frozen by Document 5 §2.1 — never change without updating the frozen spec.
    apiPrefix: "api/v1",
    cors: {
      origins: (process.env.CORS_ORIGINS ?? "http://localhost:3000")
        .split(",")
        .map((origin) => origin.trim())
        .filter(Boolean),
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
    },
    cookies: {
      domain: process.env.COOKIE_DOMAIN,
      secure: process.env.COOKIE_SECURE
        ? process.env.COOKIE_SECURE === "true"
        : env === "production",
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
  };
};
