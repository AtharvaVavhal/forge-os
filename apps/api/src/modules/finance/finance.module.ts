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
import { FinanceKycController } from "./controllers/finance-kyc.controller";
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
import { FinanceKycService } from "./services/finance-kyc.service";

/**
 * Document 5 §1: `finance` owns Invoice, Payment, Refund, CreditNote,
 * Expense, ForgeFundEntry, InvoiceSequence, CreditNoteSequence, TaxRate,
 * WebhookEvent. K7 adds Finance KYC review (`finance/kyc`) — org-scoped
 * review of team member KYC profiles (no payout/balance models).
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
    FinanceKycController,
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
    FinanceKycService,
  ],
  exports: [RazorpayOrdersService, InvoicesService],
})
export class FinanceModule {}
