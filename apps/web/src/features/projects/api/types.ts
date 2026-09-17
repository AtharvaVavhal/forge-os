export const PROJECT_STATUSES = ["ACTIVE", "ON_HOLD", "AT_RISK", "COMPLETED", "CANCELLED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export const PROJECT_PHASES = [
  "PLANNING",
  "DESIGN",
  "DEVELOPMENT",
  "QA",
  "CLIENT_REVIEW",
  "DEPLOYMENT",
  "HANDOVER",
  "COMPLETED",
] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

export const MILESTONE_STATUSES = ["PENDING", "IN_PROGRESS", "AWAITING_APPROVAL", "COMPLETED"] as const;
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number];

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "IN_REVIEW", "DONE"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export interface NamedRef {
  id: string;
  name: string;
}

export interface HandoverItem {
  item: string;
  done: boolean;
  doneAt: string | null;
  doneBy: string | null;
}

export interface Project {
  id: string;
  organizationId: string | null;
  name: string;
  dealId: string | null;
  acceptedProposalId: string | null;
  companyId: string;
  company: NamedRef | null;
  status: ProjectStatus;
  phase: ProjectPhase;
  ownerId: string;
  deadline: string | null;
  handoverChecklist: HandoverItem[];
  completedAt: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface Milestone {
  id: string;
  projectId: string;
  name: string;
  status: MilestoneStatus;
  requiresClientApproval: boolean;
  approvedAt: string | null;
  approvedByContactId: string | null;
  dueDate: string | null;
  sortOrder: number;
}

export interface Task {
  id: string;
  projectId: string;
  milestoneId: string | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeId: string | null;
  dueDate: string | null;
  blockedByTaskId: string | null;
  createdAt: string | null;
}

export interface TimeEntry {
  id: string;
  taskId: string;
  userId: string;
  minutes: number;
  loggedAt: string | null;
  createdAt: string | null;
}

export interface OffsetList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
}
