import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { CreditNoteReason, PayoutMethod, RefundStatus } from "@prisma/client";
import { PrismaService } from "../../src/database/prisma.service";
import { CRM_TEST_PREFIX } from "./crm";
import { authHeaders, type AuthSession } from "./team-shared";

/** K11/K12 e2e fixtures use this prefix so cleanup never touches seeded or other phases' data. */
export const EARNINGS_TEST_PREFIX = "phase-k11k12-e2e-";

export function listData<T = { id: string }>(body: unknown): T[] {
  return (body as { data: T[] }).data;
}

/** Auth + CSRF + a fresh `Idempotency-Key` for financial POSTs. */
export function earningsMutateHeaders(session: AuthSession, idempotencyKey?: string): Record<string, string> {
  return {
    ...authHeaders(session),
    "Idempotency-Key": idempotencyKey ?? randomUUID(),
  };
}

export async function createEarningsCompany(app: INestApplication, organizationId: string) {
  const prisma = app.get(PrismaService);
  const organization = await prisma.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { billing_state: true },
  });
  return prisma.company.create({
    data: {
      organization_id: organizationId,
      name: `${CRM_TEST_PREFIX}${EARNINGS_TEST_PREFIX}company-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      billing_state: organization.billing_state,
      billing_address: "Test fixture — safe to delete",
    },
  });
}

export async function createEarningsProject(
  app: INestApplication,
  organizationId: string,
  companyId: string,
  ownerId: string
) {
  const prisma = app.get(PrismaService);
  return prisma.project.create({
    data: {
      organization_id: organizationId,
      name: `${EARNINGS_TEST_PREFIX}project-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      company_id: companyId,
      owner_id: ownerId,
      status: "ACTIVE",
      phase: "PLANNING",
      handover_checklist: [],
    },
  });
}

export async function createEarningsInvoice(
  app: INestApplication,
  organizationId: string,
  companyId: string,
  projectId: string,
  overrides?: Partial<{ status: "DRAFT" | "SENT" | "PAID"; amount: string; paidAmount: string }>
) {
  const prisma = app.get(PrismaService);
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return prisma.invoice.create({
    data: {
      organization_id: organizationId,
      company_id: companyId,
      project_id: projectId,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only status override for fixture flexibility
      status: (overrides?.status ?? "SENT") as any,
      tax_treatment: "CGST_SGST",
      invoice_number: `${EARNINGS_TEST_PREFIX}INV-${unique}`,
      financial_year: "FIXTURE",
      bill_to_snapshot: {},
      amount: overrides?.amount ?? "10000.00",
      paid_amount: overrides?.paidAmount ?? "0.00",
    },
  });
}

export async function createEarningsPayment(
  app: INestApplication,
  organizationId: string,
  invoiceId: string,
  recordedByUserId: string,
  overrides?: Partial<{ amount: string; status: "PENDING" | "COMPLETED" | "FAILED" | "REVERSED" }>
) {
  const prisma = app.get(PrismaService);
  return prisma.payment.create({
    data: {
      organization_id: organizationId,
      invoice_id: invoiceId,
      amount: overrides?.amount ?? "10000.00",
      method: "BANK_TRANSFER",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only enum override
      status: (overrides?.status ?? "COMPLETED") as any,
      recorded_by: recordedByUserId,
      paid_at: new Date(),
    },
  });
}

export async function createEarningsRefund(
  app: INestApplication,
  organizationId: string,
  paymentId: string,
  approvedByUserId: string,
  overrides?: Partial<{ amount: string; status: RefundStatus }>
) {
  const prisma = app.get(PrismaService);
  return prisma.refund.create({
    data: {
      organization_id: organizationId,
      payment_id: paymentId,
      amount: overrides?.amount ?? "1000.00",
      reason: `${EARNINGS_TEST_PREFIX}refund`,
      status: overrides?.status ?? RefundStatus.COMPLETED,
      approved_by: approvedByUserId,
    },
  });
}

export async function createEarningsCreditNote(
  app: INestApplication,
  organizationId: string,
  invoiceId: string,
  approvedByUserId: string,
  overrides?: Partial<{ amount: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.creditNote.create({
    data: {
      organization_id: organizationId,
      credit_note_number: `${EARNINGS_TEST_PREFIX}CN-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      financial_year: "FIXTURE",
      invoice_id: invoiceId,
      reason: CreditNoteReason.GOODWILL,
      amount: overrides?.amount ?? "500.00",
      approved_by: approvedByUserId,
    },
  });
}

export async function createEarningsExpense(
  app: INestApplication,
  organizationId: string,
  recordedByUserId: string,
  overrides?: Partial<{ projectId: string; amount: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.expense.create({
    data: {
      organization_id: organizationId,
      project_id: overrides?.projectId,
      description: `${EARNINGS_TEST_PREFIX}expense`,
      amount: overrides?.amount ?? "500.00",
      category: "software",
      incurred_at: new Date(),
      recorded_by: recordedByUserId,
    },
  });
}

/** Complete bank + UPI payout profile — same completeness bar `TeamEarningsService.createPayoutRequest` requires. */
export async function upsertCompletePayoutProfile(
  app: INestApplication,
  organizationId: string,
  userId: string,
  overrides?: Partial<{ accountNumber: string }>
) {
  const prisma = app.get(PrismaService);
  return prisma.payoutProfile.upsert({
    where: { user_id: userId },
    create: {
      organization_id: organizationId,
      user_id: userId,
      preferred_method: PayoutMethod.BANK_TRANSFER,
      account_holder_name: "Test Member",
      bank_name: "Test Bank",
      account_number: overrides?.accountNumber ?? "000123456789",
      ifsc: "TEST0000001",
      upi_id: "testmember@upi",
    },
    update: {
      account_number: overrides?.accountNumber ?? "000123456789",
    },
  });
}

/** Deletes every row this fixture module could have created, in FK-safe order. */
export async function cleanupEarningsFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);

  const companyFilter = { company: { name: { startsWith: `${CRM_TEST_PREFIX}${EARNINGS_TEST_PREFIX}` } } };
  const projects = await prisma.project.findMany({
    where: { OR: [{ name: { startsWith: EARNINGS_TEST_PREFIX } }, companyFilter] },
    select: { id: true },
  });
  const projectIds = projects.map((p) => p.id);

  if (projectIds.length > 0) {
    await prisma.projectAllocationLine.deleteMany({ where: { project_allocation: { project_id: { in: projectIds } } } });
    await prisma.projectAllocation.deleteMany({ where: { project_id: { in: projectIds } } });
    await prisma.creditNoteLineItem.deleteMany({ where: { credit_note: { invoice: { project_id: { in: projectIds } } } } });
    await prisma.creditNote.deleteMany({ where: { invoice: { project_id: { in: projectIds } } } });
    await prisma.refund.deleteMany({ where: { payment: { invoice: { project_id: { in: projectIds } } } } });
    await prisma.payment.deleteMany({ where: { invoice: { project_id: { in: projectIds } } } });
    await prisma.invoiceLineItem.deleteMany({ where: { invoice: { project_id: { in: projectIds } } } });
    await prisma.invoice.deleteMany({ where: { project_id: { in: projectIds } } });
    await prisma.expense.deleteMany({ where: { project_id: { in: projectIds } } });
    await prisma.task.deleteMany({ where: { project_id: { in: projectIds } } });
    await prisma.milestone.deleteMany({ where: { project_id: { in: projectIds } } });
    await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
  }

  await prisma.company.deleteMany({
    where: { OR: [{ name: { startsWith: `${CRM_TEST_PREFIX}${EARNINGS_TEST_PREFIX}` } }, { name: { startsWith: EARNINGS_TEST_PREFIX } }] },
  });
  await prisma.expense.deleteMany({ where: { description: { startsWith: EARNINGS_TEST_PREFIX } } });

  // Both prefixes: team-shared's own test users (K11/K12 actors) and
  // fixtures.ts's `createTestUser` (used for cross-org rows in this
  // module's own e2e specs) — both can be referenced by a TeamPayoutRequest
  // or ProjectAllocation* row that must go before either cleanup deletes its
  // Restrict-FK-referenced User rows.
  const testUsers = await prisma.user.findMany({
    where: { OR: [{ email: { startsWith: "phase-b6-e2e-" } }, { email: { startsWith: "phase1-e2e-" } }] },
    select: { id: true },
  });
  const testUserIds = testUsers.map((u) => u.id);
  if (testUserIds.length > 0) {
    await prisma.teamPayoutRequest
      .deleteMany({
        where: { OR: [{ user_id: { in: testUserIds } }, { reviewed_by: { in: testUserIds } }, { approved_by: { in: testUserIds } }] },
      })
      .catch(() => {});
    await prisma.projectAllocationLine.deleteMany({ where: { user_id: { in: testUserIds } } }).catch(() => {});
    await prisma.projectAllocation
      .deleteMany({ where: { OR: [{ created_by: { in: testUserIds } }, { approved_by: { in: testUserIds } }] } })
      .catch(() => {});
  }
}
