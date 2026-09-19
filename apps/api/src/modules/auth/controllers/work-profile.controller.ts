import { Body, Controller, Get, Put, Res } from "@nestjs/common";
import type { Response } from "express";
import { CurrentUser } from "../decorators/current-user.decorator";
import type { AuthenticatedUser } from "../types/authenticated-request.interface";
import { UpsertWorkProfileDto } from "../dto/work-profile.dto";
import { WorkProfileService } from "../services/work-profile.service";

/** Self-service Work Profile for the authenticated user, under the `team/*` namespace for consistency with `team/kyc` and `team/payout-profile`. No sensitive data — no no-store needed. */
@Controller("team/work-profile")
export class WorkProfileController {
  constructor(private readonly workProfiles: WorkProfileService) {}

  @Get()
  getOwn(@CurrentUser() actor: AuthenticatedUser) {
    return this.workProfiles.getOwn(actor);
  }

  @Put()
  upsertOwn(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpsertWorkProfileDto,
    @Res({ passthrough: true }) response: Response
  ) {
    return this.workProfiles.upsertOwn(actor, dto, response);
  }
}
