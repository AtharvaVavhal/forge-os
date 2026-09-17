import { Module } from "@nestjs/common";
import { InvoicesController } from "./controllers/invoices.controller";
import { PaymentsController } from "./controllers/payments.controller";
import { RefundsController } from "./controllers/refunds.controller";
import { CreditNotesController } from "./controllers/credit-notes.controller";
import { ExpensesController } from "./controllers/expenses.controller";
import { ForgeFundController } from "./controllers/forge-fund.controller";
import { TaxRatesController } from "./controllers/tax-rates.controller";
import { SequencesController } from "./controllers/sequences.controller";
import { WebhooksController } from "./controllers/webhooks.controller";
import { InvoicesService } from "./services/invoices.service";
import { PaymentsService } from "./services/payments.service";
import { RefundsService } from "./services/refunds.service";
import { CreditNotesService } from "./services/credit-notes.service";
import { ExpensesService } from "./services/expenses.service";
import { ForgeFundService } from "./services/forge-fund.service";
import { TaxRatesService } from "./services/tax-rates.service";
import { SequencesService } from "./services/sequences.service";
import { RazorpayService } from "./services/razorpay.service";
import { RazorpayOrdersService } from "./services/razorpay-orders.service";

/**
 * Document 5 §1: `finance` owns Invoice, Payment, Refund, CreditNote,
 * Expense, ForgeFundEntry, InvoiceSequence, CreditNoteSequence, TaxRate,
 * WebhookEvent; may depend on `projects` (read — Expense/Invoice project
 * FK validation reuses only Prisma queries, not a cross-module service
 * import, per the same module-boundary reasoning as every other module's
 * own `scope-guards.ts`), `crm` (read Company), `shared` (AuditService,
 * global). Must not import `sales` directly — `InvoicesService.
 * createFromProposal` queries `Proposal`/`ProposalLineItem` straight
 * through Prisma, the same pattern B2's Deal-WON check used for `Proposal`
 * before `sales` existed.
 */
@Module({
  controllers: [
    InvoicesController,
    PaymentsController,
    RefundsController,
    CreditNotesController,
    ExpensesController,
    ForgeFundController,
    TaxRatesController,
    SequencesController,
    WebhooksController,
  ],
  providers: [
    InvoicesService,
    PaymentsService,
    RefundsService,
    CreditNotesService,
    ExpensesService,
    ForgeFundService,
    TaxRatesService,
    SequencesService,
    RazorpayService,
    RazorpayOrdersService,
  ],
  // PortalModule imports this narrowly for `createOrderForPortalInvoice`
  // (Document 5 §11 pay) — no other finance write surfaces are exported.
  exports: [RazorpayOrdersService],
})
export class FinanceModule {}
