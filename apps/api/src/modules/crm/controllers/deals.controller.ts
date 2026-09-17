import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { DealsService } from "../services/deals.service";
import {
  BulkReassignDealsDto,
  CreateDealDto,
  ListDealsQueryDto,
  ReopenDealDto,
  TransitionDealDto,
  UpdateDealDto,
} from "../dto/deal.dto";

/** Document 5 §5.4. Same TEAM_MEMBER denial as Leads (see leads.controller.ts). */
@Controller("deals")
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  @RequirePermissions("crm.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListDealsQueryDto) {
    return this.deals.list(user, query);
  }

  // Registered before ":id" so "/deals/bulk-reassign" doesn't get parsed
  // as a UUID path param by the ":id" route below.
  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post("bulk-reassign")
  bulkReassign(@CurrentUser() user: AuthenticatedUser, @Body() dto: BulkReassignDealsDto) {
    return this.deals.bulkReassign(user, dto);
  }

  @RequirePermissions("crm.read")
  @Get(":id")
  get(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.deals.get(user, id);
  }

  @RequirePermissions("crm.manage")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDealDto) {
    return this.deals.create(user, dto);
  }

  @RequirePermissions("crm.manage")
  @Patch(":id")
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: UpdateDealDto
  ) {
    return this.deals.update(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/transition")
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionDealDto
  ) {
    return this.deals.transition(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/reopen")
  reopen(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReopenDealDto
  ) {
    return this.deals.reopen(user, id, dto);
  }

  @RequirePermissions("crm.manage")
  @HttpCode(200)
  @Post(":id/archive")
  archive(@CurrentUser() user: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.deals.archive(user, id);
  }
}
