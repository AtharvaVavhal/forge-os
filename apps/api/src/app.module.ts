import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import configuration from "./config/configuration";
import type { AppConfig } from "./config/configuration";
import { validate } from "./config/env.validation";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";
import { AuthModule } from "./modules/auth/auth.module";
import { CsrfGuard } from "./modules/auth/guards/csrf.guard";
import { JwtAuthGuard } from "./modules/auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "./modules/auth/guards/permissions.guard";
import { SharedModule } from "./modules/shared/shared.module";
import { CrmModule } from "./modules/crm/crm.module";
import { SalesModule } from "./modules/sales/sales.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate,
      // apps/api has no .env of its own — DATABASE_URL/APP_DB_ROLE already
      // live at the repo root (used by the Prisma CLI too) and this app
      // reuses that single source rather than duplicating DB credentials
      // into a second file that could drift out of sync.
      envFilePath: [".env", "../../.env"],
    }),
    // In-memory (per-process), no Redis — Step 13's explicit instruction.
    // A generic global default; the three security-sensitive endpoints
    // (login, invitation accept, password reset) apply their own tighter
    // `@Throttle(...)` overrides (see modules/auth/rate-limits.ts).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => [
        {
          name: "default",
          ttl: 60_000,
          limit: config.get("env", { infer: true }) === "test" ? 1000 : 100,
        },
      ],
    }),
    PrismaModule,
    SharedModule,
    HealthModule,
    AuthModule,
    CrmModule,
    SalesModule,
    // Remaining domain modules (projects, finance, team, portal) are
    // added here starting in a later phase — see src/modules/README.md.
  ],
  providers: [
    // Global guard chain, explicit order (Step 8/9/12):
    //   1. ThrottlerGuard — reject abusive request volume before anything
    //      else runs, including on unauthenticated routes like /auth/login.
    //   2. JwtAuthGuard — authenticate (fail-closed; @Public() opts out).
    //   3. PermissionsGuard — authorize by role (Step 9), no-op if a route
    //      declares no @RequirePermissions(...).
    //   4. CsrfGuard — validate the double-submit token on authenticated,
    //      state-changing requests (Step 12), after we know who's asking.
    // Registered together, in this file, in this order, specifically so
    // the evaluation order is explicit and doesn't depend on cross-module
    // provider-aggregation order.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: JwtAuthGuard },
    { provide: APP_GUARD, useExisting: PermissionsGuard },
    { provide: APP_GUARD, useExisting: CsrfGuard },
  ],
})
export class AppModule {}
