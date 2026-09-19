import { ConflictException } from "@nestjs/common";
import { ProjectAllocationStatus } from "@prisma/client";

/**
 * K11: DRAFT -> APPROVED | CANCELLED. APPROVED and CANCELLED are both
 * terminal — corrections to an APPROVED round are new rows (adjustment_of_id),
 * never a transition out of APPROVED.
 */
const VALID_TRANSITIONS: Record<ProjectAllocationStatus, ReadonlySet<ProjectAllocationStatus>> = {
  DRAFT: new Set([ProjectAllocationStatus.APPROVED, ProjectAllocationStatus.CANCELLED]),
  APPROVED: new Set(),
  CANCELLED: new Set(),
};

export function isProjectAllocationEditable(status: ProjectAllocationStatus): boolean {
  return status === ProjectAllocationStatus.DRAFT;
}

export function assertValidProjectAllocationTransition(
  current: ProjectAllocationStatus,
  target: ProjectAllocationStatus
): void {
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed.has(target)) {
    throw new ConflictException({
      code: "PROJECT_ALLOCATION_INVALID_TRANSITION",
      message: `Invalid status transition from ${current} to ${target}.`,
    });
  }
}
