import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

/**
 * Same pattern and reasoning as `modules/crm/services/scope-guards.ts`
 * (validate a client-supplied cross-entity foreign key belongs to the
 * caller's organization before it's written) — kept as `sales`'s own
 * small, self-contained copy rather than importing CRM's internal
 * service file. Document 5 §1 allows `sales` to depend on `crm` (read
 * Deal), but that means the *module boundary*, not reaching into
 * another module's private implementation files; this is six lines,
 * cheaper to duplicate than to couple the two modules' internals.
 *
 * `404`, not `403` — Document 6 §3.2: "Cross-organization UUID | 404 (no
 * existence leak)."
 */
function assertInOrg(exists: boolean, notFoundMessage: string): void {
  if (!exists) {
    throw new NotFoundException({ code: "NOT_FOUND", message: notFoundMessage });
  }
}

export async function assertDealInOrg(
  prisma: PrismaService,
  dealId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.deal.findFirst({
    where: { id: dealId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Deal not found.");
}

export async function assertTaxRateInOrg(
  prisma: PrismaService,
  taxRateId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.taxRate.findFirst({
    where: { id: taxRateId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Tax rate not found.");
}
