import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ProjectAllocationsService } from "../services/project-allocations.service";
import {
  ApproveProjectAllocationDto,
  CancelProjectAllocationDto,
  CreateProjectAllocationDto,
  ListProjectAllocationsQueryDto,
  ReplaceProjectAllocationLinesDto,
} from "../dto/project-allocation.dto";

/**
 * K11 — Finance-only. `finance.read` for both GET routes; every write is
 * `finance.manage` (approve is the authoritative pool-vs-cumulative gate —
 * see ProjectAllocationsService.approve — not a separate finance.approve
 * permission, which doesn't exist in the frozen catalog).
 */
@Controller("project-allocations")
export class ProjectAllocationsController {
  constructor(private readonly allocations: ProjectAllocationsService) {}

  @RequirePermissions("finance.read")
  @Get()
  list(@CurrentUser() actor: AuthenticatedUser, @Query() query: ListProjectAllocationsQueryDto) {
    return this.allocations.list(actor, query);
  }

  @RequirePermissions("finance.read")
  @Get(":id")
  get(@CurrentUser() actor: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.allocations.get(actor, id);
  }

  @RequirePermissions("finance.manage")
  @Post()
  create(@CurrentUser() actor: AuthenticatedUser, @Body() dto: CreateProjectAllocationDto) {
    return this.allocations.create(actor, dto);
  }

  @RequirePermissions("finance.manage")
  @Patch(":id/lines")
  replaceLines(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReplaceProjectAllocationLinesDto
  ) {
    return this.allocations.replaceLines(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/approve")
  approve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ApproveProjectAllocationDto
  ) {
    return this.allocations.approve(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/cancel")
  cancel(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: CancelProjectAllocationDto
  ) {
    return this.allocations.cancel(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @HttpCode(200)
  @Post(":id/adjust")
  adjust(@CurrentUser() actor: AuthenticatedUser, @Param("id", ParseUUIDPipe) id: string) {
    return this.allocations.adjust(actor, id);
  }
}
