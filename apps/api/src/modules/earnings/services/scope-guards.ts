import { ConflictException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../database/prisma.service";

/**
 * Same pattern as `modules/finance/services/scope-guards.ts` and
 * `modules/crm/services/scope-guards.ts` — self-contained per module
 * rather than importing another module's internals. 404, not 403 —
 * cross-organization UUIDs must not leak existence.
 */
function assertInOrg(exists: boolean, notFoundMessage: string): void {
  if (!exists) {
    throw new NotFoundException({ code: "NOT_FOUND", message: notFoundMessage });
  }
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

/**
 * Validates the referenced user exists in the caller's organization AND is
 * active. Cross-org / nonexistent both collapse to the same non-leaking 404
 * (matches every other scope-guard in this codebase); "exists but inactive"
 * is a distinct, real conflict — the member is real and in-org, just not
 * eligible for allocation/payout actions right now.
 */
export async function assertUserInOrgAndActive(
  prisma: PrismaService,
  userId: string,
  organizationId: string
): Promise<void> {
  const row = await prisma.user.findFirst({
    where: { id: userId, organization_id: organizationId },
    select: { id: true, active: true },
  });
  assertInOrg(!!row, "User not found.");
  if (!row!.active) {
    throw new ConflictException({
      code: "MEMBER_INACTIVE",
      message: "This team member is inactive.",
    });
  }
}
