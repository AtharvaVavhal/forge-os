import { ConflictException, UnprocessableEntityException } from "@nestjs/common";
import { ProjectPhase, ProjectStatus } from "@prisma/client";

/**
 * Document 5 §12.4:
 * Status: ACTIVE ⇄ ON_HOLD; ACTIVE ⇄ AT_RISK; ACTIVE → COMPLETED | CANCELLED.
 * COMPLETED / CANCELLED are terminal.
 */
export const TERMINAL_PROJECT_STATUSES: ReadonlySet<ProjectStatus> = new Set([
  ProjectStatus.COMPLETED,
  ProjectStatus.CANCELLED,
]);

export function assertValidStatusTransition(
  currentStatus: ProjectStatus,
  targetStatus: ProjectStatus
): void {
  if (currentStatus === targetStatus) {
    return;
  }

  if (TERMINAL_PROJECT_STATUSES.has(currentStatus)) {
    throw new ConflictException({
      code: "PROJECT_STATUS_TERMINAL",
      message: `Project in ${currentStatus} status is terminal and cannot transition to ${targetStatus}.`,
    });
  }

  const validTransitions: Record<ProjectStatus, ReadonlySet<ProjectStatus>> = {
    ACTIVE: new Set([ProjectStatus.ON_HOLD, ProjectStatus.AT_RISK, ProjectStatus.CANCELLED]),
    ON_HOLD: new Set([ProjectStatus.ACTIVE]),
    AT_RISK: new Set([ProjectStatus.ACTIVE]),
    COMPLETED: new Set(),
    CANCELLED: new Set(),
  };

  const allowed = validTransitions[currentStatus];
  if (!allowed || !allowed.has(targetStatus)) {
    throw new ConflictException({
      code: "PROJECT_INVALID_STATUS_TRANSITION",
      message: `Invalid status transition from ${currentStatus} to ${targetStatus}.`,
    });
  }
}

/**
 * Document 5 §12.4:
 * Phase: linear Planning → Design → Development → QA → Client Review → Deployment → Handover → Completed;
 * skip only with override reason + audit.
 */
export const PROJECT_PHASE_ORDER: readonly ProjectPhase[] = [
  ProjectPhase.PLANNING,
  ProjectPhase.DESIGN,
  ProjectPhase.DEVELOPMENT,
  ProjectPhase.QA,
  ProjectPhase.CLIENT_REVIEW,
  ProjectPhase.DEPLOYMENT,
  ProjectPhase.HANDOVER,
  ProjectPhase.COMPLETED,
] as const;

export function isNextLinearPhase(from: ProjectPhase, to: ProjectPhase): boolean {
  const fromIndex = PROJECT_PHASE_ORDER.indexOf(from);
  const toIndex = PROJECT_PHASE_ORDER.indexOf(to);
  return toIndex === fromIndex + 1;
}

export function isPhaseSkip(from: ProjectPhase, to: ProjectPhase): boolean {
  const fromIndex = PROJECT_PHASE_ORDER.indexOf(from);
  const toIndex = PROJECT_PHASE_ORDER.indexOf(to);
  return toIndex > fromIndex + 1;
}

export function assertValidPhaseProgression(
  from: ProjectPhase,
  to: ProjectPhase,
  override?: boolean
): void {
  if (from === to) {
    return;
  }

  if (from === ProjectPhase.COMPLETED) {
    throw new ConflictException({
      code: "PROJECT_PHASE_TERMINAL",
      message: "Project is already in COMPLETED phase.",
    });
  }

  const fromIndex = PROJECT_PHASE_ORDER.indexOf(from);
  const toIndex = PROJECT_PHASE_ORDER.indexOf(to);

  if (toIndex < fromIndex) {
    throw new ConflictException({
      code: "PROJECT_INVALID_PHASE_REGRESSION",
      message: `Cannot regress phase from ${from} to ${to}.`,
    });
  }

  if (isPhaseSkip(from, to) && !override) {
    throw new ConflictException({
      code: "PHASE_SKIP_REQUIRES_OVERRIDE",
      message: `Skipping phases from ${from} to ${to} requires override authorization.`,
    });
  }
}

/**
 * Document 5 §12.4 Phase Gates:
 * 1. CLIENT_REVIEW → DEPLOYMENT blocked without gating milestone approved_at.
 * 2. COMPLETED blocked unless handover checklist all done.
 */
export interface GatingMilestone {
  id: string;
  requiresClientApproval: boolean;
  approvedAt: Date | null;
}

export interface HandoverChecklistItem {
  item: string;
  done: boolean;
  doneAt?: string | null;
  doneBy?: string | null;
}

export function assertPhaseGatesSatisfied(
  from: ProjectPhase,
  to: ProjectPhase,
  context: {
    milestones: GatingMilestone[];
    handoverChecklist: HandoverChecklistItem[];
    override?: boolean;
  }
): void {
  if (context.override) {
    return;
  }

  // Gate 1: CLIENT_REVIEW -> DEPLOYMENT blocked without gating milestone approved_at.
  if (from === ProjectPhase.CLIENT_REVIEW && to === ProjectPhase.DEPLOYMENT) {
    const gatingMilestones = context.milestones.filter((m) => m.requiresClientApproval);
    if (gatingMilestones.length === 0) {
      throw new UnprocessableEntityException({
        code: "PHASE_GATE_FAILED",
        message: "CLIENT_REVIEW to DEPLOYMENT requires at least one gating milestone with client approval.",
      });
    }

    const hasUnapproved = gatingMilestones.some((m) => !m.approvedAt);
    if (hasUnapproved) {
      throw new UnprocessableEntityException({
        code: "PHASE_GATE_FAILED",
        message: "CLIENT_REVIEW to DEPLOYMENT is blocked without gating milestone approved_at.",
      });
    }
  }

  // Gate 2: Transition to COMPLETED blocked unless handover checklist all done.
  if (to === ProjectPhase.COMPLETED) {
    assertHandoverChecklistAllDone(context.handoverChecklist);
  }
}

export function assertHandoverChecklistAllDone(checklist: HandoverChecklistItem[]): void {
  const hasIncomplete = checklist.some((item) => !item.done);
  if (hasIncomplete) {
    throw new UnprocessableEntityException({
      code: "HANDOVER_CHECKLIST_INCOMPLETE",
      message: "COMPLETED is blocked unless all handover checklist items are done.",
    });
  }
}
