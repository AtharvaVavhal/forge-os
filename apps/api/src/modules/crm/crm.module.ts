import { Module } from "@nestjs/common";
import { CompaniesController } from "./controllers/companies.controller";
import { ContactsController } from "./controllers/contacts.controller";
import { LeadsController } from "./controllers/leads.controller";
import { DealsController } from "./controllers/deals.controller";
import { ActivitiesController } from "./controllers/activities.controller";
import { CompaniesService } from "./services/companies.service";
import { ContactsService } from "./services/contacts.service";
import { LeadsService } from "./services/leads.service";
import { DealsService } from "./services/deals.service";
import { ActivitiesService } from "./services/activities.service";

/**
 * Document 5 §1: `crm` owns Company, Contact, Lead, Deal; may depend on
 * `shared` (AuditService — injected globally, no explicit import needed)
 * and `auth` (read-only — this module reads `AuthenticatedUser`/
 * `@RequirePermissions` but never imports AuthModule's providers). Must
 * not import `finance` or `projects` — neither is imported here.
 *
 * `PrismaService` is available via the global `PrismaModule` (Phase 0),
 * same as every other module.
 */
@Module({
  controllers: [CompaniesController, ContactsController, LeadsController, DealsController, ActivitiesController],
  providers: [CompaniesService, ContactsService, LeadsService, DealsService, ActivitiesService],
})
export class CrmModule {}
