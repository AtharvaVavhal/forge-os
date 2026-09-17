import { plainToInstance } from "class-transformer";
import {
  IsBooleanString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from "class-validator";

enum NodeEnvironment {
  Development = "development",
  Test = "test",
  Production = "production",
}

/**
 * `SESSION_JWT_SIGNING_KEY` is the one variable that's genuinely required
 * (no built-in default) — the app must not boot with a hardcoded/guessable
 * signing secret (Document 6 §20: "Session/JWT signing keys | Server-only;
 * rotate with invalidation plan"). Every other Phase 1 variable below has
 * an explicit, documented DEFAULT — Document 6 repeatedly marks the exact
 * production values as `NOT CURRENTLY DEFINED` (session TTL, invitation
 * TTL, password-reset TTL, rate-limit numbers — §5.2, §6.2, §7, §14, §26).
 * These defaults are development conveniences, not claimed frozen values;
 * every one is overridable via environment configuration, and production
 * deployments are expected to set them explicitly rather than trust the
 * default.
 */
class EnvironmentVariables {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 4000;

  @IsString()
  DATABASE_URL!: string;

  @IsOptional()
  @IsString()
  APP_DB_ROLE?: string;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  // --- Session / JWT (Document 6 §5) ----------------------------------------

  @IsString()
  @MinLength(32, {
    message: "SESSION_JWT_SIGNING_KEY must be at least 32 characters (HMAC secret strength).",
  })
  SESSION_JWT_SIGNING_KEY!: string;

  /** Default: 12h. Document 6 §5.2 item 1 — exact TTL NOT CURRENTLY DEFINED. */
  @IsInt()
  @Min(60)
  SESSION_JWT_TTL_SECONDS: number = 43_200;

  /** Cookie `Secure` flag. Document 6 §5.2 item 5 treats this as mandatory
   * in production HTTPS but doesn't freeze the exact toggle mechanism —
   * defaults to true in production, false otherwise, overridable. */
  @IsOptional()
  @IsBooleanString()
  COOKIE_SECURE?: string;

  /** Document 6 §5.2 item 5 — cookie Domain is NOT CURRENTLY DEFINED;
   * omitted (host-only cookie) unless explicitly set. */
  @IsOptional()
  @IsString()
  COOKIE_DOMAIN?: string;

  // --- Password hashing (Document 6 §3) -------------------------------------

  /** bcrypt cost factor. Not frozen by Document 6 — see password.service.ts. */
  @IsInt()
  @Min(10)
  @Max(15)
  PASSWORD_HASH_COST_FACTOR: number = 12;

  // --- Password reset (Document 6 §7) ---------------------------------------

  /** Default: 30 min — within Document 6 §7's frozen "15-30 min" range,
   * exact value NOT CURRENTLY DEFINED beyond that range. */
  @IsInt()
  @Min(60)
  PASSWORD_RESET_TOKEN_TTL_SECONDS: number = 1_800;

  // --- Invitations (Document 6 §6) ------------------------------------------

  /** Default: 7 days — matches Document 1's own example ("e.g. 7 days"),
   * not a frozen production constant (Document 6 §6.2, §26 item 7). */
  @IsInt()
  @Min(1)
  INVITATION_TOKEN_TTL_DAYS: number = 7;

  // --- Google Workspace SSO (Document 6 §4.1, §20) --------------------------
  // All optional: SSO is not required to boot the app locally. Endpoints
  // return a clear "not configured" error if these are unset, rather than
  // the app failing to start over an integration that may not be wired up
  // yet in a given environment.

  @IsOptional()
  @IsString()
  GOOGLE_OAUTH_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_OAUTH_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_OAUTH_REDIRECT_URI?: string;

  // --- Rate limiting (Document 6 §14, Step 13) ------------------------------
  // In-memory (per-process) via @nestjs/throttler — no Redis, per Step 13's
  // explicit instruction not to introduce one. Exact production numbers are
  // NOT CURRENTLY DEFINED (Document 6 §14); these are conservative,
  // configurable defaults.

  @IsInt()
  @Min(1)
  RATE_LIMIT_LOGIN_MAX: number = 5;

  @IsInt()
  @Min(1)
  RATE_LIMIT_LOGIN_WINDOW_SECONDS: number = 60;

  @IsInt()
  @Min(1)
  RATE_LIMIT_INVITATION_ACCEPT_MAX: number = 5;

  @IsInt()
  @Min(1)
  RATE_LIMIT_INVITATION_ACCEPT_WINDOW_SECONDS: number = 60;

  @IsInt()
  @Min(1)
  RATE_LIMIT_PASSWORD_RESET_MAX: number = 3;

  @IsInt()
  @Min(1)
  RATE_LIMIT_PASSWORD_RESET_WINDOW_SECONDS: number = 300;
}

export function validate(config: Record<string, unknown>): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, { skipMissingProperties: false });

  if (errors.length > 0) {
    throw new Error(
      `Invalid environment configuration:\n${errors
        .map((e) => Object.values(e.constraints ?? {}).join(", "))
        .join("\n")}`
    );
  }

  return validated;
}
