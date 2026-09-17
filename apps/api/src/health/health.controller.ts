import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from "@nestjs/terminus";
import { PrismaService } from "../database/prisma.service";
import { Public } from "../modules/auth/decorators/public.decorator";

/**
 * Three endpoints, all under the frozen `/api/v1` prefix (Document 5 §2.1 —
 * no exception carved out for health, so it stays versioned like everything
 * else):
 *
 *   GET /api/v1/health/live   — process is responding. No dependency checks.
 *   GET /api/v1/health/ready  — process + database connectivity.
 *   GET /api/v1/health        — convenience alias for /ready.
 *
 * This split matters operationally: a deploy orchestrator's liveness probe
 * (should I restart this container?) and readiness probe (should traffic be
 * routed to it?) are different questions — a database blip should fail
 * readiness without triggering a restart loop on liveness.
 *
 * Database connectivity uses `@nestjs/terminus`'s own official
 * `PrismaHealthIndicator` (ships built in as of Terminus 12) rather than a
 * hand-rolled indicator — it already does the right thing (a real
 * `SELECT 1`-equivalent ping with a timeout) against our `PrismaService`.
 */
@Public()
@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly prisma: PrismaService
  ) {}

  @Get("live")
  @HealthCheck()
  live() {
    return this.health.check([]);
  }

  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([() => this.prismaIndicator.pingCheck("database", this.prisma)]);
  }

  @Get()
  @HealthCheck()
  full() {
    return this.health.check([() => this.prismaIndicator.pingCheck("database", this.prisma)]);
  }
}
