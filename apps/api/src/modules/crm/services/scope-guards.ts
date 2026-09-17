import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

/**
 * Validates that a client-supplied foreign key (`companyId`, `contactId`,
 * `dealId`, `ownerId`, ...) actually belongs to the caller's organization
 * before it is written onto a new row. Without this, a client could link
 * a Contact/Deal/Activity to another organization's Company by UUID alone
 * — Prisma's FK constraint only requires the referenced row to *exist
 * somewhere*, not that it belongs to the caller (this is exactly the
 * "accessing another organization's records through nested relations"
 * attack the security review checks for).
 *
 * `404`, not `403` — Document 6 §3.2: "Cross-organization UUID | 404 (no
 * existence leak)."
 */
function assertInOrg(exists: boolean, notFoundMessage: string): void {
  if (!exists) {
    throw new NotFoundException({ code: "NOT_FOUND", message: notFoundMessage });
  }
}

export async function assertCompanyInOrg(
  prisma: PrismaService,
  companyId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.company.findFirst({
    where: { id: companyId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Company not found.");
}

export async function assertContactInOrg(
  prisma: PrismaService,
  contactId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.contact.findFirst({
    where: { id: contactId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Contact not found.");
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

export async function assertUserInOrg(
  prisma: PrismaService,
  userId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "User not found.");
}
