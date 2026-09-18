import { Body, Controller, Get, Patch, Post, UseInterceptors } from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { CreateKycProfileDto, UpdateKycProfileDto } from "../dto/kyc.dto";
import { KycService } from "../services/kyc.service";

/**
 * Self-service KYC for the authenticated user (TEAM_MEMBER own-profile).
 * No `@RequirePermissions` — Decision B: no kyc.* permissions; ownership
 * is enforced in `KycService` via actor.id + organizationId.
 * K8: no-store — responses include PAN / government ID numbers.
 */
@Controller("team/kyc")
@UseInterceptors(NoStoreCacheInterceptor)
export class KycController {
  constructor(private readonly kyc: KycService) {}

  @Get()
  getOwn(@CurrentUser() actor: AuthenticatedUser) {
    return this.kyc.getOwn(actor);
  }

  @Post()
  createOwn(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: CreateKycProfileDto
  ) {
    return this.kyc.createOwn(actor, dto);
  }

  @Patch()
  updateOwn(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpdateKycProfileDto
  ) {
    return this.kyc.updateOwn(actor, dto);
  }

  @Post("submit")
  submitOwn(@CurrentUser() actor: AuthenticatedUser) {
    return this.kyc.submitOwn(actor);
  }
}
