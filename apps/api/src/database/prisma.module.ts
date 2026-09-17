import { Global, Module } from "@nestjs/common";
import { PrismaService } from "./prisma.service";

/**
 * Global so every future feature module (crm, sales, projects, finance,
 * team, portal, shared) can inject `PrismaService` without each one
 * re-importing this module — matches the "shared is imported by everyone"
 * shape Document 5 §1 already defines for the domain module graph.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
