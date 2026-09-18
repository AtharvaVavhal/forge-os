import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  UseInterceptors,
} from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import {
  PresignUpiQrDto,
  RegisterUpiQrDto,
  UpsertPayoutProfileDto,
} from "../dto/payout-profile.dto";
import { PayoutProfileService } from "../services/payout-profile.service";

/**
 * Self-service payout profile for the authenticated user.
 * FINAL: bank + UPI fields on PUT; UPI QR via dedicated R2 endpoints.
 * K8: no-store — responses include bank account / IFSC / UPI.
 */
@Controller("team/payout-profile")
@UseInterceptors(NoStoreCacheInterceptor)
export class PayoutProfileController {
  constructor(private readonly payoutProfiles: PayoutProfileService) {}

  @Get()
  getOwn(@CurrentUser() actor: AuthenticatedUser) {
    return this.payoutProfiles.getOwn(actor);
  }

  @Put()
  upsertOwn(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: UpsertPayoutProfileDto
  ) {
    return this.payoutProfiles.upsertOwn(actor, dto);
  }

  @Post("upi-qr/presign-upload")
  presignUpiQr(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PresignUpiQrDto
  ) {
    return this.payoutProfiles.presignUpiQr(actor, dto);
  }

  @Post("upi-qr")
  registerUpiQr(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RegisterUpiQrDto
  ) {
    return this.payoutProfiles.registerUpiQr(actor, dto);
  }

  @Post("upi-qr/delete")
  removeUpiQr(@CurrentUser() actor: AuthenticatedUser) {
    return this.payoutProfiles.removeUpiQr(actor);
  }

  @Get("upi-qr/download-url")
  getUpiQrDownloadUrl(@CurrentUser() actor: AuthenticatedUser) {
    return this.payoutProfiles.getUpiQrDownloadUrl(actor);
  }
}
