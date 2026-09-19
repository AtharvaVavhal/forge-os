import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TeamEarningsService } from "../services/team-earnings.service";
import { CreateTeamPayoutRequestDto, ListPayoutsQueryDto } from "../dto/team-payout.dto";

/**
 * Self-service withdrawals for the authenticated team member. No
 * `@RequirePermissions` — every query/mutation here is scoped to
 * `actor.id`; there is no `userId` parameter anywhere in this controller
 * or its DTOs, so a member cannot address another member's payout by id
 * substitution (`getOwnPayout` 404s on any id that isn't both in-org and
 * theirs). No-store: responses include bank/UPI destination details.
 */
@Controller("team/payouts")
@UseInterceptors(NoStoreCacheInterceptor)
export class TeamPayoutsController {
  constructor(private readonly earnings: TeamEarningsService) {}

  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListPayoutsQueryDto) {
    return this.earnings.listOwnPayouts(actor, query);
  }

  @Get(":id")
  get(@CurrentUser() actor: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.earnings.getOwnPayout(actor, id);
  }

  @Idempotent()
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateTeamPayoutRequestDto) {
    return this.earnings.createPayoutRequest(actor, dto);
  }
}
