import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseInterceptors,
} from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import {
  PresignKycDocumentDto,
  RegisterKycDocumentDto,
} from "../dto/kyc.dto";
import { KycDocumentsService } from "../services/kyc-documents.service";

/**
 * Self-service KYC document storage — mirrors `/documents` flow via
 * StorageService (presign → R2 PUT → register + HeadObject → signed GET).
 * Ownership is always the caller's own KycProfile; no kyc.* permissions.
 * K8: no-store — download-url responses contain short-lived signed URLs.
 */
@Controller("team/kyc/documents")
@UseInterceptors(NoStoreCacheInterceptor)
export class KycDocumentsController {
  constructor(private readonly kycDocuments: KycDocumentsService) {}

  @Post("presign-upload")
  presignUpload(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: PresignKycDocumentDto
  ) {
    return this.kycDocuments.presignUpload(actor, dto);
  }

  @Post()
  registerUpload(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RegisterKycDocumentDto
  ) {
    return this.kycDocuments.registerUpload(actor, dto);
  }

  @Get(":id/download-url")
  getDownloadUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.kycDocuments.getDownloadUrl(actor, id);
  }

  @Post(":id/delete")
  remove(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.kycDocuments.remove(actor, id);
  }
}
