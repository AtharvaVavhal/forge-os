import { ForbiddenException } from "@nestjs/common";
import { UserRole, type Prisma } from "@prisma/client";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";

export function isProjectsManager(actor: AuthenticatedUser): boolean {
  return actor.role === UserRole.FOUNDER_ADMIN || actor.role === UserRole.OPERATIONS;
}

/**
 * Document 5 §4.3 footnote 4 / Document 6 §2.3 footnote 4:
 * TEAM_MEMBER is scoped to "assigned project owner or task assignee scope".
 */
export function teamMemberProjectWhere(actor: AuthenticatedUser): Prisma.ProjectWhereInput {
  if (actor.role !== UserRole.TEAM_MEMBER) {
    return {};
  }
  return {
    OR: [
      { owner_id: actor.id },
      { tasks: { some: { assignee_id: actor.id } } },
    ],
  };
}

export function assertTeamMemberMayAccessProject(
  actor: AuthenticatedUser,
  project: { owner_id: string; tasks?: { assignee_id: string | null }[] }
): void {
  if (actor.role !== UserRole.TEAM_MEMBER) {
    return;
  }
  const isOwner = project.owner_id === actor.id;
  const isAssignee = project.tasks?.some((t) => t.assignee_id === actor.id) ?? false;
  if (!isOwner && !isAssignee) {
    throw new ForbiddenException({
      code: "FORBIDDEN_PERMISSION",
      message: "You don't have permission to access this project.",
    });
  }
}

/**
 * Task mutations (PATCH / transition):
 * Callable by projects.manage OR the task's assignee ("assignee self").
 */
export function assertCanMutateTask(
  actor: AuthenticatedUser,
  task: { assignee_id: string | null }
): void {
  if (isProjectsManager(actor)) {
    return;
  }
  if (task.assignee_id === actor.id) {
    return;
  }
  throw new ForbiddenException({
    code: "FORBIDDEN_PERMISSION",
    message: "You can only modify or transition tasks assigned to you.",
  });
}

/**
 * Time entry deletion:
 * Callable by projects.manage OR the author of the time entry.
 */
export function assertCanDeleteTimeEntry(
  actor: AuthenticatedUser,
  entry: { user_id: string }
): void {
  if (isProjectsManager(actor)) {
    return;
  }
  if (entry.user_id === actor.id) {
    return;
  }
  throw new ForbiddenException({
    code: "FORBIDDEN_PERMISSION",
    message: "You can only delete your own time entries.",
  });
}
