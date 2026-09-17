import { plainToInstance } from "class-transformer";
import { IsEnum, IsInt, IsOptional, IsString, Max, Min, validateSync } from "class-validator";

enum NodeEnvironment {
  Development = "development",
  Test = "test",
  Production = "production",
}

/**
 * Phase 0 only validates the environment variables Phase 0 code actually
 * reads. Auth/session/secret variables (JWT signing keys, Razorpay, R2,
 * Resend, Google Workspace OAuth — Document 6 §20) are documented in
 * .env.example as NOT CURRENTLY DEFINED / Phase-1-required, but are
 * deliberately not validated here yet — requiring them at Phase 0 startup
 * would make the foundation fail to boot for a phase of work that hasn't
 * started, which is the opposite of what a foundation is for.
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
