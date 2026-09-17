import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ActivitiesService } from "../services/activities.service";
import { CreateActivityDto, ListActivitiesQueryDto } from "../dto/activity.dto";

/**
 * Document 5 §10.1: `GET/POST /activities` only (no detail-by-id route in
 * the frozen inventory). Gated on `crm.read` at the route level (baseline
 * reachability, matching the four roles that can read CRM data at all);
 * the broader creator role set Document 6 §2.3 names for Activities
 * (which doesn't line up 1:1 with `crm.manage`) is enforced inside
 * `ActivitiesService.create` — see policies/resource-authorization.ts.
 */
@Controller("activities")
export class ActivitiesController {
  constructor(private readonly activities: ActivitiesService) {}

  @RequirePermissions("crm.read")
  @Get()
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListActivitiesQueryDto) {
    return this.activities.list(user, query);
  }

  @RequirePermissions("crm.read")
  @Post()
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateActivityDto) {
    return this.activities.create(user, dto);
  }
}
