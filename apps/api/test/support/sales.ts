import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../../src/database/prisma.service";
import { CRM_TEST_PREFIX } from "./crm";

/** B3 Sales e2e fixtures use this prefix so cleanup never touches seeded or other phases' data. */
export const SALES_TEST_PREFIX = "phase-b3-e2e-";

export async function createTestProposal(
  app: INestApplication,
  organizationId: string,
  dealId: string,
  createdByUserId: string,
  overrides?: Partial<{
    version: number;
    status: "DRAFT" | "SENT" | "VIEWED" | "ACCEPTED" | "REJECTED" | "EXPIRED";
    terms: string;
  }>
) {
  const prisma = app.get(PrismaService);
  return prisma.proposal.create({
    data: {
      organization_id: organizationId,
      deal_id: dealId,
      version: overrides?.version ?? 1,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only status override for lifecycle fixtures
      status: (overrides?.status ?? "DRAFT") as any,
      terms: overrides?.terms ?? `${SALES_TEST_PREFIX}fixture terms`,
      created_by: createdByUserId,
    },
  });
}

export async function createTestLineItem(
  app: INestApplication,
  organizationId: string,
  proposalId: string,
  overrides?: Partial<{ description: string; quantity: string; unitPrice: string; sortOrder: number }>
) {
  const prisma = app.get(PrismaService);
  return prisma.proposalLineItem.create({
    data: {
      organization_id: organizationId,
      proposal_id: proposalId,
      description: overrides?.description ?? `${SALES_TEST_PREFIX}line item`,
      quantity: overrides?.quantity ?? "1.00",
      unit_price: overrides?.unitPrice ?? "5000.00",
      sort_order: overrides?.sortOrder ?? 0,
    },
  });
}

export async function createTestTaxRate(app: INestApplication, organizationId: string) {
  const prisma = app.get(PrismaService);
  return prisma.taxRate.create({
    data: {
      organization_id: organizationId,
      hsn_sac_code: "998314",
      description: `${SALES_TEST_PREFIX}tax rate`,
      cgst_rate: "9.00",
      sgst_rate: "9.00",
      igst_rate: "18.00",
      effective_from: new Date("2020-01-01"),
    },
  });
}

/**
 * Deletes every Proposal/line-item this fixture module could have
 * created. Matched via the **Deal's** title prefix (`CRM_TEST_PREFIX`),
 * not the Proposal's own `terms` — `terms` is optional and a test may
 * legitimately create a proposal through the real API without setting
 * it, which would make a `terms`-based match silently miss rows. Every
 * B3 test proposal is attached to a `createTestDeal(...)`-created deal,
 * so the deal's title prefix reliably identifies all of them regardless
 * of how the proposal itself was created (fixture helper or real API
 * call). Line items cascade-delete with their proposal (schema:
 * `onDelete: Cascade`), so deleting them explicitly first isn't required
 * for FK safety, but is done anyway for a predictable, verifiable order.
 *
 * Must run **before** `cleanupCrmFixtures` in a test file's `afterAll` —
 * `Proposal.deal` is `onDelete: Restrict`, so a still-referenced test
 * Deal cannot be deleted until every Proposal pointing at it is gone
 * first.
 */
export async function cleanupSalesFixtures(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  const dealFilter = { deal: { title: { startsWith: CRM_TEST_PREFIX } } };

  await prisma.proposalLineItem.deleteMany({ where: { proposal: dealFilter } });
  await prisma.proposal.deleteMany({ where: dealFilter });
  await prisma.taxRate.deleteMany({ where: { description: { startsWith: SALES_TEST_PREFIX } } });
}
