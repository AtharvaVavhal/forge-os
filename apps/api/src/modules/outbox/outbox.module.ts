import { Module } from "@nestjs/common";
import { FinanceModule } from "../finance/finance.module";
import { DealWonConsumer } from "./consumers/deal-won.consumer";
import { ProposalAcceptedConsumer } from "./consumers/proposal-accepted.consumer";
import { ProposalSentConsumer } from "./consumers/proposal-sent.consumer";
import { DomainEventOutboxService } from "./domain-event-outbox.service";
import { DomainEventWorkerService } from "./domain-event-worker.service";

/**
 * B8 transactional outbox (Document 5 §14).
 * Imports FinanceModule only for draft-invoice creation — does not create
 * CRM↔Finance↔Projects cycles (Deal WON sync lives in CrmModule/Prisma).
 */
@Module({
  imports: [FinanceModule],
  providers: [
    DealWonConsumer,
    ProposalAcceptedConsumer,
    ProposalSentConsumer,
    DomainEventOutboxService,
    DomainEventWorkerService,
  ],
  exports: [DomainEventOutboxService],
})
export class OutboxModule {}
