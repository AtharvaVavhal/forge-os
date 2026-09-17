import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

/**
 * Thin lifecycle wrapper around the generated Prisma client — connects on
 * module init, disconnects on module destroy (which fires when
 * `app.enableShutdownHooks()` in main.ts receives SIGTERM/SIGINT, giving the
 * process a clean shutdown instead of dropping in-flight queries).
 *
 * Does NOT modify prisma/schema.prisma or the migration history — this is
 * purely the NestJS-side connection wiring the frozen schema needs to be
 * usable from the API at all.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log("Connected to database.");
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log("Disconnected from database.");
  }
}
