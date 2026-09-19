import { Controller, Get, Query, UseInterceptors } from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { OffsetPaginationQueryDto } from "../../../common/pagination/offset-pagination";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TeamEarningsService } from "../services/team-earnings.service";

/**
 * Self-service earnings summary for the authenticated team member. No
 * `@RequirePermissions` — ownership is enforced in TeamEarningsService via
 * `actor.id` + `organizationId`, same pattern as `team/kyc` and
 * `team/payout-profile`. No-store: financial totals must never be cached.
 */
@Controller("team/earnings")
@UseInterceptors(NoStoreCacheInterceptor)
export class TeamEarningsController {
  constructor(private readonly earnings: TeamEarningsService) {}

  @Get()
  getSummary(@CurrentUser() actor: AuthenticatedUser) {
    return this.earnings.getSummary(actor);
  }

  @Get("allocations")
  listAllocations(@CurrentUser() actor: AuthenticatedUser, @Query() query: OffsetPaginationQueryDto) {
    return this.earnings.listOwnAllocationLines(actor, query);
  }
}
