import { BadRequestException, ConflictException } from "@nestjs/common";
import { MilestoneStatus } from "@prisma/client";

export const MILESTONE_FORWARD_STEPS: Record<MilestoneStatus, MilestoneStatus | null> = {
  PENDING: MilestoneStatus.IN_PROGRESS,
  IN_PROGRESS: MilestoneStatus.AWAITING_APPROVAL,
  AWAITING_APPROVAL: MilestoneStatus.COMPLETED,
  COMPLETED: null,
};

export const MILESTONE_BACKWARD_STEPS: Record<MilestoneStatus, MilestoneStatus | null> = {
  PENDING: null,
  IN_PROGRESS: MilestoneStatus.PENDING,
  AWAITING_APPROVAL: MilestoneStatus.IN_PROGRESS,
  COMPLETED: MilestoneStatus.AWAITING_APPROVAL,
};

export function assertValidMilestoneTransition(
  from: MilestoneStatus,
  to: MilestoneStatus,
  reason?: string
): void {
  if (from === to) {
    return;
  }

  // Check if reverting from COMPLETED
  if (from === MilestoneStatus.COMPLETED) {
    if (!reason || reason.trim().length === 0) {
      throw new BadRequestException({
        code: "MILESTONE_REVERT_REASON_REQUIRED",
        message: "Reverting a completed milestone requires a reason.",
      });
    }

    // From COMPLETED, can revert backward
    const allowedReverts = new Set<MilestoneStatus>([
      MilestoneStatus.AWAITING_APPROVAL,
      MilestoneStatus.IN_PROGRESS,
      MilestoneStatus.PENDING,
    ]);
    if (!allowedReverts.has(to)) {
      throw new ConflictException({
        code: "MILESTONE_INVALID_TRANSITION",
        message: `Cannot revert milestone from ${from} to ${to}.`,
      });
    }
    return;
  }

  // Normal transitions
  const allowedTargets = new Set<MilestoneStatus>();
  const forward = MILESTONE_FORWARD_STEPS[from];
  if (forward) allowedTargets.add(forward);

  const backward = MILESTONE_BACKWARD_STEPS[from];
  if (backward) allowedTargets.add(backward);

  if (!allowedTargets.has(to)) {
    throw new ConflictException({
      code: "MILESTONE_INVALID_TRANSITION",
      message: `Invalid milestone transition from ${from} to ${to}.`,
    });
  }
}
