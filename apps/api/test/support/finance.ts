import type { INestApplication } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaService } from "../../src/database/prisma.service";
import { authHeaders, CRM_TEST_PREFIX, type AuthSession } from "./crm";
import { TEST_EMAIL_PREFIX } from "./fixtures";

/** B5 Finance e2e fixtures use this prefix so cleanup never touches seeded or other phases' data. */
export const FINANCE_TEST_PREFIX = "phase-b5-e2e-";

/**
 * Auth + CSRF headers plus a fresh `Idempotency-Key` (Document 5 §2.7 —
 * required on financial POSTs). Pass an explicit key for replay tests.
 */
export function financeMutateHeaders(session: AuthSession, idempotencyKey?: string): Record<string, string> {
  return {
    ...authHeaders(session),
    "Idempotency-Key": idempotencyKey ?? randomUUID(),
  };
}

/** A company created for Finance tests, always billed from the SAME state as the seeded org (so tax_treatment computes to CGST_SGST by default — see createCrossStateCompany for the IGST case). */
export async function createTestCompany(app: INestApplication, organizationId: string, billingState?: string) {
  const prisma = app.get(PrismaService);
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { billing_state: true },
  });
  return prisma.company.create({
    data: {
      organization_id: organizationId,
      name: `${CRM_TEST_PREFIX}${FINANCE_TEST_PREFIX}company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      billing_state: billingState ?? organization.billing_state,
      gstin: "27AAAAA0000A1Z5",
      billing_address: "Test fixture — safe to delete",
    },
  });
}

export async function createTestTaxRate(
  app: INestApplication,
  organizationId: string,
  overrides?: Partial<{ hsnSacCode: string; cgstRate: string; sgstRate: string; igstRate: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.taxRate.create({
    data: {
      organization_id: organizationId,
      hsn_sac_code: overrides?.hsnSacCode ?? "998314",
      description: `${FINANCE_TEST_PREFIX}tax rate`,
      cgst_rate: overrides?.cgstRate ?? "9.00",
      sgst_rate: overrides?.sgstRate ?? "9.00",
      igst_rate: overrides?.igstRate ?? "18.00",
      effective_from: new Date("2020-01-01"),
    },
  });
}

export async function createTestInvoice(
  app: INestApplication,
  organizationId: string,
  companyId: string,
  overrides?: Partial<{
    status: "DRAFT" | "SENT" | "PARTIALLY_PAID" | "PAID" | "OVERDUE" | "VOID" | "CANCELLED";
    amount: string;
    paidAmount: string;
    invoiceNumber: string;
    financialYear: string;
  }>
) {
  const prisma = app.get(PrismaService);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.invoice.create({
    data: {
      organization_id: organizationId,
      company_id: companyId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only status/enum override for fixture flexibility
      status: (overrides?.status ?? "DRAFT") as any,
      tax_treatment: "CGST_SGST",
      invoice_number: overrides?.invoiceNumber ?? `${FINANCE_TEST_PREFIX}DRAFT-${unique}`,
      financial_year: overrides?.financialYear ?? "FIXTURE",
      bill_to_snapshot: {},
      amount: overrides?.amount ?? "10000.00",
      paid_amount: overrides?.paidAmount ?? "0.00",
    },
  });
}

export async function createTestInvoiceLineItem(
  app: INestApplication,
  organizationId: string,
  invoiceId: string,
  overrides?: Partial<{ description: string; lineTotal: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.invoiceLineItem.create({
    data: {
      organization_id: organizationId,
      invoice_id: invoiceId,
      description: overrides?.description ?? `${FINANCE_TEST_PREFIX}line item`,
      hsn_sac_code: "998314",
      quantity: "1.00",
      unit_price: "10000.00",
      line_total: overrides?.lineTotal ?? "10000.00",
    },
  });
}

export async function createTestPayment(
  app: INestApplication,
  organizationId: string,
  invoiceId: string,
  recordedByUserId: string | null,
  overrides?: Partial<{
    amount: string;
    status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED";
    method: "CASH" | "BANK_TRANSFER" | "CHEQUE" | "RAZORPAY";
    razorpayOrderId: string;
    razorpayPaymentId: string;
  }>
) {
  const prisma = app.get(PrismaService);
  return prisma.payment.create({
    data: {
      organization_id: organizationId,
      invoice_id: invoiceId,
      amount: overrides?.amount ?? "1000.00",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only enum override
      method: (overrides?.method ?? "CASH") as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only enum override
      status: (overrides?.status ?? "COMPLETED") as any,
      recorded_by: recordedByUserId ?? undefined,
      paid_at: new Date(),
      razorpay_order_id: overrides?.razorpayOrderId,
      razorpay_payment_id: overrides?.razorpayPaymentId,
    },
  });
}

export async function createTestExpense(app: INestApplication, organizationId: string, recordedByUserId: string) {
  const prisma = app.get(PrismaService);
  return prisma.expense.create({
    data: {
      organization_id: organizationId,
      description: `${FINANCE_TEST_PREFIX}expense`,
      amount: "500.00",
      category: "software",
      incurred_at: new Date(),
      recorded_by: recordedByUserId,
    },
  });
}

export async function createTestForgeFundEntry(
  app: INestApplication,
  organizationId: string,
  approvedByUserId: string,
  overrides?: Partial<{ type: "CONTRIBUTION" | "WITHDRAWAL" | "ALLOCATION"; amount: string; sourceType: string; sourceId: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.forgeFundEntry.create({
    data: {
      organization_id: organizationId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only enum override
      type: (overrides?.type ?? "CONTRIBUTION") as any,
      amount: overrides?.amount ?? "1000.00",
      source_type: overrides?.sourceType,
      source_id: overrides?.sourceId,
      reason: `${FINANCE_TEST_PREFIX}fixture entry`,
      approved_by: approvedByUserId,
    },
  });
}

/** Signs a raw JSON body exactly as Razorpay would, for constructing valid test webhook requests. Test-only secret is read from RAZORPAY_WEBHOOK_SECRET (see .env). */
export function signWebhookPayload(rawBody: string): string {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET must be set in the test environment (see .env) to sign a test webhook payload.");
  }
  return createHmac("sha256", secret).update(rawBody).digest("hex");
}

/** Deletes every row this fixture module (and the Finance module's own e2e tests) could have created, in FK-safe order. */
export async function cleanupFinanceFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const companyFilter = { company: { name: { startsWith: `${CRM_TEST_PREFIX}${FINANCE_TEST_PREFIX}` } } };

  // Webhook-created automatic ForgeFundEntry rows (source_type='payment')
  // have a system-generated `reason` with no FINANCE_TEST_PREFIX in it —
  // `source_id` has no real FK to Payment (it's a loose string reference
  // by design, matching the frozen schema), so these must be found and
  // removed *before* the Payments they reference are deleted below, or
  // they become permanently unidentifiable orphans.
  const testPayments = await prisma.payment.findMany({ where: { invoice: companyFilter }, select: { id: true } });
  if (testPayments.length > 0) {
    await prisma.forgeFundEntry.deleteMany({
      where: { source_type: "payment", source_id: { in: testPayments.map((p) => p.id) } },
    });
  }

  await prisma.creditNoteLineItem.deleteMany({ where: { credit_note: { invoice: companyFilter } } });
  await prisma.creditNote.deleteMany({ where: { invoice: companyFilter } });
  await prisma.refund.deleteMany({ where: { payment: { invoice: companyFilter } } });
  await prisma.payment.deleteMany({ where: { invoice: companyFilter } });
  await prisma.invoiceLineItem.deleteMany({ where: { invoice: companyFilter } });
  await prisma.invoice.deleteMany({ where: companyFilter });

  // from-proposal e2e attaches CRM deals to finance test companies —
  // clear those Restrict FKs before deleting companies.
  const financeCompanies = await prisma.company.findMany({
    where: { name: { startsWith: `${CRM_TEST_PREFIX}${FINANCE_TEST_PREFIX}` } },
    select: { id: true },
  });
  if (financeCompanies.length > 0) {
    const companyIds = financeCompanies.map((c) => c.id);
    await prisma.proposalLineItem.deleteMany({ where: { proposal: { deal: { company_id: { in: companyIds } } } } });
    await prisma.proposal.deleteMany({ where: { deal: { company_id: { in: companyIds } } } });
    await prisma.deal.deleteMany({ where: { company_id: { in: companyIds } } });
  }

  await prisma.company.deleteMany({ where: { name: { startsWith: `${CRM_TEST_PREFIX}${FINANCE_TEST_PREFIX}` } } });

  // Expense/ForgeFundEntry rows are matched by *actor* (recorded_by /
  // approved_by referencing a phase1-e2e-* test User), not by scanning
  // free-text description/reason strings for FINANCE_TEST_PREFIX — many
  // of this phase's own e2e assertions legitimately create entries with
  // ad-hoc, unprefixed reason text (e.g. "audit test"), and a prefix-only
  // match would leave those as orphans that later block Phase 1's own
  // `cleanupTestFixtures` from deleting the test Users they reference
  // (both columns are RESTRICT foreign keys) — found via a real FK
  // violation surfaced by running the full suite, not a hypothetical.
  const testUsers = await prisma.user.findMany({
    where: { email: { startsWith: TEST_EMAIL_PREFIX } },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);
  if (testUserIds.length > 0) {
    await prisma.expense.deleteMany({ where: { recorded_by: { in: testUserIds } } });
    await prisma.forgeFundEntry.deleteMany({ where: { approved_by: { in: testUserIds } } });
  }
  // Belt-and-suspenders: also catch anything tagged by description/reason
  // prefix that might somehow reference a non-test-prefixed actor.
  await prisma.expense.deleteMany({ where: { description: { startsWith: FINANCE_TEST_PREFIX } } });
  await prisma.forgeFundEntry.deleteMany({ where: { reason: { startsWith: FINANCE_TEST_PREFIX } } });

  await prisma.taxRate.deleteMany({ where: { description: { startsWith: FINANCE_TEST_PREFIX } } });
  await prisma.webhookEvent.deleteMany({ where: { event_type: { startsWith: FINANCE_TEST_PREFIX } } });
}
