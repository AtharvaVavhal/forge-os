import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

/**
 * Same pattern as `modules/crm/services/scope-guards.ts` and
 * `modules/sales/services/scope-guards.ts` — validates a client-supplied
 * cross-entity foreign key belongs to the caller's organization before
 * it's trusted, and self-contained per module rather than importing
 * another module's internals (Document 5 §1's module boundaries describe
 * *module* dependencies, not license to reach into private files).
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
): Promise<{ id: string; billing_state: string | null }> {
  const row = await prisma.company.findFirst({
    where: { id: companyId, organization_id: organizationId },
    select: { id: true, billing_state: true },
  });
  assertInOrg(!!row, "Company not found.");
  return row!;
}

export async function assertProjectInOrg(
  prisma: PrismaService,
  projectId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.project.findFirst({
    where: { id: projectId, organization_id: organizationId },
    select: { id: true },
  });
  assertInOrg(!!row, "Project not found.");
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
