import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import {
  parseMilestone,
  parseMilestoneList,
  parseProject,
  parseProjectList,
  parseTask,
  parseTaskList,
  parseTimeEntry,
  parseTimeEntryList,
} from "./parse";
import { projectPaths } from "./paths";
import type {
  HandoverItem,
  MilestoneStatus,
  ProjectPhase,
  ProjectStatus,
  TaskPriority,
  TaskStatus,
} from "./types";
import {
  milestoneTransitionBody,
  projectPhaseBody,
  projectStatusBody,
  taskTransitionBody,
} from "./lifecycle";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function listProjects(
  query: { page?: number; pageSize?: number; companyId?: string; q?: string } = {}
) {
  const payload = await apiClient.get<unknown>(projectPaths.projects, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      companyId: query.companyId,
      q: query.q,
    },
  });
  return requireParsed(parseProjectList(payload), "project list");
}

export async function getProject(id: string) {
  const payload = await apiClient.get<unknown>(projectPaths.project(id));
  return requireParsed(parseProject(payload), "project");
}

export async function createProject(body: {
  name: string;
  companyId: string;
  ownerId: string;
  dealId?: string;
  deadline?: string;
}) {
  const payload = await browserMutate<unknown>("POST", projectPaths.projects, { body });
  return requireParsed(parseProject(payload), "project");
}

export async function updateProject(
  id: string,
  body: Partial<{ name: string; deadline: string; ownerId: string }>
) {
  const payload = await browserMutate<unknown>("PATCH", projectPaths.project(id), { body });
  return requireParsed(parseProject(payload), "project");
}

export async function transitionProjectStatus(id: string, to: ProjectStatus) {
  const payload = await browserMutate<unknown>("POST", projectPaths.status(id), {
    body: projectStatusBody(to),
  });
  return requireParsed(parseProject(payload), "project");
}

export async function transitionProjectPhase(id: string, to: ProjectPhase, override?: boolean) {
  const payload = await browserMutate<unknown>("POST", projectPaths.phase(id), {
    body: projectPhaseBody(to, override),
  });
  return requireParsed(parseProject(payload), "project");
}

export async function updateHandoverChecklist(id: string, items: HandoverItem[]) {
  const payload = await browserMutate<unknown>("PATCH", projectPaths.handover(id), {
    body: {
      items: items.map((item) => ({
        item: item.item,
        done: item.done,
        doneAt: item.doneAt,
        doneBy: item.doneBy,
      })),
    },
  });
  return requireParsed(parseProject(payload), "project");
}

export async function completeProject(id: string) {
  const payload = await browserMutate<unknown>("POST", projectPaths.complete(id), { body: {} });
  return requireParsed(parseProject(payload), "project");
}

export async function listMilestones(projectId: string) {
  const payload = await apiClient.get<unknown>(projectPaths.milestones(projectId));
  return requireParsed(parseMilestoneList(payload), "milestone list");
}

export async function createMilestone(
  projectId: string,
  body: { name: string; requiresClientApproval?: boolean; dueDate?: string }
) {
  const payload = await browserMutate<unknown>("POST", projectPaths.milestones(projectId), { body });
  return requireParsed(parseMilestone(payload), "milestone");
}

export async function transitionMilestone(id: string, to: MilestoneStatus, reason?: string) {
  const payload = await browserMutate<unknown>("POST", projectPaths.transitionMilestone(id), {
    body: milestoneTransitionBody(to, reason),
  });
  return requireParsed(parseMilestone(payload), "milestone");
}

export async function listTasks(projectId: string) {
  const payload = await apiClient.get<unknown>(projectPaths.tasks(projectId));
  return requireParsed(parseTaskList(payload), "task list");
}

export async function createTask(
  projectId: string,
  body: { title: string; priority?: TaskPriority; milestoneId?: string; dueDate?: string }
) {
  const payload = await browserMutate<unknown>("POST", projectPaths.tasks(projectId), { body });
  return requireParsed(parseTask(payload), "task");
}

export async function updateTask(
  id: string,
  body: Partial<{
    title: string;
    priority: TaskPriority;
    dueDate: string;
    milestoneId: string;
    blockedByTaskId: string | null;
  }>
) {
  const payload = await browserMutate<unknown>("PATCH", projectPaths.task(id), { body });
  return requireParsed(parseTask(payload), "task");
}

export async function transitionTask(id: string, to: TaskStatus) {
  const payload = await browserMutate<unknown>("POST", projectPaths.transitionTask(id), {
    body: taskTransitionBody(to),
  });
  return requireParsed(parseTask(payload), "task");
}

export async function assignTask(id: string, assigneeId: string) {
  const payload = await browserMutate<unknown>("POST", projectPaths.assignTask(id), {
    body: { assigneeId },
  });
  return requireParsed(parseTask(payload), "task");
}

export async function listTimeEntries(taskId: string) {
  const payload = await apiClient.get<unknown>(projectPaths.timeEntries(taskId));
  return requireParsed(parseTimeEntryList(payload), "time entry list");
}

export async function createTimeEntry(taskId: string, body: { minutes: number; loggedAt: string }) {
  const payload = await browserMutate<unknown>("POST", projectPaths.timeEntries(taskId), { body });
  return requireParsed(parseTimeEntry(payload), "time entry");
}

export async function deleteTimeEntry(id: string) {
  await browserMutate<unknown>("DELETE", projectPaths.timeEntry(id));
}
