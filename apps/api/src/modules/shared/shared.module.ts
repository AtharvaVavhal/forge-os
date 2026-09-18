import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../database/prisma.module";
import { AuditService } from "./audit.service";
import { OrganizationContextService } from "./organization-context.service";
import { NotesService } from "./notes/services/notes.service";
import { NotesController } from "./notes/controllers/notes.controller";
import { StorageService } from "./documents/services/storage.service";
import { DocumentsService } from "./documents/services/documents.service";
import { DocumentsController } from "./documents/controllers/documents.controller";
import { NotificationsService } from "./notifications/services/notifications.service";
import { NotificationsController } from "./notifications/controllers/notifications.controller";
import { SearchService } from "./search/services/search.service";
import { SearchController } from "./search/controllers/search.controller";
import { AuditLogsService } from "./audit-logs/services/audit-logs.service";
import { AuditLogsController } from "./audit-logs/controllers/audit-logs.controller";
import { EmailService } from "./email/services/email.service";
import { BankDirectoryService } from "./bank-directory/services/bank-directory.service";
import { BankDirectoryController } from "./bank-directory/controllers/bank-directory.controller";

/**
 * Global, per Document 5 §1: "shared... imported by everyone, imports no
 * one." B6 registers Notes, Documents, Notifications, Search, and Audit
 * Logs query surfaces alongside the existing AuditLog-writing and
 * single-org-resolution slices.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [
    NotesController,
    DocumentsController,
    NotificationsController,
    SearchController,
    AuditLogsController,
    BankDirectoryController,
  ],
  providers: [
    AuditService,
    OrganizationContextService,
    NotesService,
    StorageService,
    DocumentsService,
    NotificationsService,
    SearchService,
    AuditLogsService,
    EmailService,
    BankDirectoryService,
  ],
  exports: [
    AuditService,
    OrganizationContextService,
    NotesService,
    StorageService,
    DocumentsService,
    NotificationsService,
    SearchService,
    AuditLogsService,
    EmailService,
    BankDirectoryService,
  ],
})
export class SharedModule {}
