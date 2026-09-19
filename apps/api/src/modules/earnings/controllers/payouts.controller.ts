import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, UseInterceptors } from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import { Idempotent } from "../../../common/idempotency/idempotent.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { TeamPayoutsService } from "../services/team-payouts.service";
import {
  ApproveTeamPayoutDto,
  ListPayoutsQueryDto,
  MarkFailedTeamPayoutDto,
  MarkPaidTeamPayoutDto,
  ProcessTeamPayoutDto,
  RejectTeamPayoutDto,
  ReviewTeamPayoutDto,
} from "../dto/team-payout.dto";

/**
 * K12 — Finance-only payout review pipeline. `finance.manage` on every
 * route including GET (frozen instruction: "Payout GET: finance.manage
 * ONLY" — unlike ProjectAllocation's GET, which is `finance.read`).
 * `@UseInterceptors(NoStoreCacheInterceptor)` because every response here
 * includes `destination` (bank account number, IFSC, UPI ID) — same
 * no-store precedent as `finance/kyc` and `team/kyc`.
 */
@Controller("payouts")
@UseInterceptors(NoStoreCacheInterceptor)
export class PayoutsController {
  constructor(private readonly payouts: TeamPayoutsService) {}

  @RequirePermissions("finance.manage")
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListPayoutsQueryDto) {
    return this.payouts.list(actor, query);
  }

  @RequirePermissions("finance.manage")
  @Get(":id")
  get(@CurrentUser() actor: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.payouts.get(actor, id);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/review")
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewTeamPayoutDto
  ) {
    return this.payouts.review(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/approve")
  approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApproveTeamPayoutDto
  ) {
    return this.payouts.approve(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/reject")
  reject(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: RejectTeamPayoutDto
  ) {
    return this.payouts.reject(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/process")
  process(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ProcessTeamPayoutDto
  ) {
    return this.payouts.process(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @Idempotent()
  @HttpCode(200)
  @Post(":id/mark-paid")
  markPaid(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MarkPaidTeamPayoutDto
  ) {
    return this.payouts.markPaid(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/mark-failed")
  markFailed(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: MarkFailedTeamPayoutDto
  ) {
    return this.payouts.markFailed(actor, id, dto);
  }
}
