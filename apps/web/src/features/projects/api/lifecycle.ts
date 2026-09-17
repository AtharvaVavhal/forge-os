import type { MilestoneStatus, ProjectPhase, ProjectStatus, TaskStatus } from "./types";
import { PROJECT_PHASES } from "./types";

export function nextProjectStatuses(status: ProjectStatus): ProjectStatus[] {
  switch (status) {
    case "ACTIVE":
      return ["ON_HOLD", "AT_RISK", "CANCELLED"];
    case "ON_HOLD":
    case "AT_RISK":
      return ["ACTIVE"];
    default:
      return [];
  }
}

export function nextProjectPhase(phase: ProjectPhase): ProjectPhase | null {
  const index = PROJECT_PHASES.indexOf(phase);
  if (index === -1 || index === PROJECT_PHASES.length - 1) return null;
  return PROJECT_PHASES[index + 1] ?? null;
}

export function isPhaseSkip(from: ProjectPhase, to: ProjectPhase): boolean {
  return PROJECT_PHASES.indexOf(to) > PROJECT_PHASES.indexOf(from) + 1;
}

export function nextMilestoneStatuses(status: MilestoneStatus): MilestoneStatus[] {
  switch (status) {
    case "PENDING":
      return ["IN_PROGRESS"];
    case "IN_PROGRESS":
      return ["AWAITING_APPROVAL"];
    case "AWAITING_APPROVAL":
      return ["COMPLETED"];
    default:
      return [];
  }
}

export function previousMilestoneStatus(status: MilestoneStatus): MilestoneStatus | null {
  switch (status) {
    case "IN_PROGRESS":
      return "PENDING";
    case "AWAITING_APPROVAL":
      return "IN_PROGRESS";
    case "COMPLETED":
      return "AWAITING_APPROVAL";
    default:
      return null;
  }
}

export function nextTaskStatuses(status: TaskStatus): TaskStatus[] {
  switch (status) {
    case "TODO":
      return ["IN_PROGRESS"];
    case "IN_PROGRESS":
      return ["IN_REVIEW"];
    case "IN_REVIEW":
      return ["DONE"];
    case "DONE":
      return ["TODO"];
    default:
      return [];
  }
}

export function projectStatusBody(to: ProjectStatus) {
  return { to };
}

export function projectPhaseBody(to: ProjectPhase, override?: boolean) {
  return override ? { to, override: true } : { to };
}

export function milestoneTransitionBody(to: MilestoneStatus, reason?: string) {
  return reason ? { to, reason } : { to };
}

export function taskTransitionBody(to: TaskStatus) {
  return { to };
}
