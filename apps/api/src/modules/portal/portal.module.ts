import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { AuthModule } from "../auth/auth.module";
import { FinanceModule } from "../finance/finance.module";
import { PortalController } from "./controllers/portal.controller";
import { PortalAuthGuard } from "./guards/portal-auth.guard";
import { PortalAuthService } from "./services/portal-auth.service";
import { PortalSessionService } from "./services/portal-session.service";
import { PortalProjectsService } from "./services/portal-projects.service";
import { PortalProposalsService } from "./services/portal-proposals.service";
import { PortalInvoicesService } from "./services/portal-invoices.service";
import { PortalDocumentsService } from "./services/portal-documents.service";
import { PortalSupportService } from "./services/portal-support.service";

/**
 * Document 5 §1 / §11 — Client Portal module.
 * Depends on AuthModule (PasswordService, CsrfService) and FinanceModule
 * (RazorpayOrdersService) for order creation only — no Deal-Won orchestration.
 */
@Module({
  imports: [JwtModule.register({}), AuthModule, FinanceModule],
  controllers: [PortalController],
  providers: [
    PortalSessionService,
    PortalAuthService,
    PortalAuthGuard,
    PortalProjectsService,
    PortalProposalsService,
    PortalInvoicesService,
    PortalDocumentsService,
    PortalSupportService,
  ],
  exports: [PortalAuthGuard, PortalSessionService],
})
export class PortalModule {}
