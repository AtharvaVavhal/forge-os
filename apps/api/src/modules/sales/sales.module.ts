import { Module } from "@nestjs/common";
import { ProposalsController } from "./controllers/proposals.controller";
import { ProposalsService } from "./services/proposals.service";

/**
 * Document 5 §1: `sales` owns Proposal, ProposalLineItem; may depend on
 * `crm` (read Deal — via its own scope-guards.ts, not a cross-module
 * import) and `shared` (AuditService, injected globally). Must not
 * import `finance` — not imported here.
 */
@Module({
  controllers: [ProposalsController],
  providers: [ProposalsService],
})
export class SalesModule {}
