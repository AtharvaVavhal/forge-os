import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseInterceptors,
} from "@nestjs/common";
import { NoStoreCacheInterceptor } from "../../../common/interceptors/no-store-cache.interceptor";
import { RequirePermissions } from "../../auth/decorators/require-permissions.decorator";
import { CurrentUser } from "../../auth/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";
import { ListFinanceKycQueryDto, ReviewFinanceKycDto } from "../dto/finance-kyc.dto";
import { FinanceKycService } from "../services/finance-kyc.service";

/**
 * Finance KYC review surface.
 * Agreed namespace: /api/v1/finance/kyc (not the generic /invoices-style prefix).
 * Authorization: finance.manage only — TEAM_MEMBER never has this permission.
 */
@Controller("finance/kyc")
@UseInterceptors(NoStoreCacheInterceptor)
export class FinanceKycController {
  constructor(private readonly financeKyc: FinanceKycService) {}

  @RequirePermissions("finance.manage")
  @Get()
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @Query() query: ListFinanceKycQueryDto
  ) {
    return this.financeKyc.list(actor, query);
  }

  @RequirePermissions("finance.manage")
  @Get(":id")
  get(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string
  ) {
    return this.financeKyc.get(actor, id);
  }

  @RequirePermissions("finance.manage")
  @Post(":id/review")
  review(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Body() dto: ReviewFinanceKycDto
  ) {
    return this.financeKyc.review(actor, id, dto);
  }

  @RequirePermissions("finance.manage")
  @Get(":id/documents/:documentId/download-url")
  documentDownloadUrl(
    @CurrentUser() actor: AuthenticatedUser,
    @Param("id", ParseUUIDPipe) id: string,
    @Param("documentId", ParseUUIDPipe) documentId: string
  ) {
    return this.financeKyc.getDocumentDownloadUrl(actor, id, documentId);
  }
}
