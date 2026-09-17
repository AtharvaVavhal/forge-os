import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import configuration from "./config/configuration";
import { validate } from "./config/env.validation";
import { PrismaModule } from "./database/prisma.module";
import { HealthModule } from "./health/health.module";

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
    PrismaModule,
    HealthModule,
    // Domain modules (auth, crm, sales, projects, finance, team, portal,
    // shared) are added here starting in Phase 1 — see src/modules/README.md.
  ],
})
export class AppModule {}
