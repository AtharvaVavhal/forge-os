import { Global, Module } from "@nestjs/common";
import { AuditService } from "./audit.service";
import { OrganizationContextService } from "./organization-context.service";

/**
 * Global, per Document 5 §1: "shared... imported by everyone, imports no
 * one." Only the AuditLog-writing and single-org-resolution slices of
 * `shared` exist yet — Activity/Note/Document/Notification/DomainEvent
 * are out of scope until a module that needs them is implemented.
 */
@Global()
@Module({
  providers: [AuditService, OrganizationContextService],
  exports: [AuditService, OrganizationContextService],
})
export class SharedModule {}
