import {
  Body,
  Controller,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from "@nestjs/common";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { MilestonesService } from "../services/milestones.service";
import { TransitionMilestoneDto } from "../dto/milestone.dto";

@Controller("milestones")
export class MilestonesController {
  constructor(private readonly milestones: MilestonesService) {}

  @RequirePermissions("projects.manage")
  @HttpCode(200)
  @Post(":id/transition")
  transition(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: TransitionMilestoneDto
  ) {
    return this.milestones.transition(user, id, dto);
  }
}
