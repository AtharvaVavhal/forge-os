import { ConflictException } from "@nestjs/common";
import { TaskStatus } from "@prisma/client";

export function isTaskReopen(from: TaskStatus, to: TaskStatus): boolean {
  return from === TaskStatus.DONE && to === TaskStatus.TODO;
}

export function assertValidTaskTransition(from: TaskStatus, to: TaskStatus): void {
  if (from === to) {
    return;
  }

  // Reopen path: DONE -> TODO
  if (isTaskReopen(from, to)) {
    return;
  }

  const validTransitions: Record<TaskStatus, ReadonlySet<TaskStatus>> = {
    TODO: new Set([TaskStatus.IN_PROGRESS]),
    IN_PROGRESS: new Set([TaskStatus.IN_REVIEW, TaskStatus.TODO]),
    IN_REVIEW: new Set([TaskStatus.DONE, TaskStatus.IN_PROGRESS]),
    DONE: new Set([TaskStatus.TODO]),
  };

  const allowed = validTransitions[from];
  if (!allowed || !allowed.has(to)) {
    throw new ConflictException({
      code: "TASK_INVALID_TRANSITION",
      message: `Invalid task transition from ${from} to ${to}.`,
    });
  }
}
