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
}

/**
 * Consumed via `ConfigService.get<T>('path.to.value')`. Kept as one small,
 * typed shape rather than scattering `process.env` reads across the app —
 * every later module reads config the same way.
 */
export default (): AppConfig => ({
  env: (process.env.NODE_ENV as AppConfig["env"]) ?? "development",
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
});
