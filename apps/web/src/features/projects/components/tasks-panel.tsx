"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Drawer } from "@/components/overlays/drawer";
import { Can } from "@/features/auth/authorization/can";
import { queryErrorMessage } from "@/lib/api/query-error";
import { useToast } from "@/components/overlays/toast";
import { enumLabel, formatDate } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { assignTask, createTask, listTasks, transitionTask, updateTask } from "../api/projects-api";
import { nextTaskStatuses } from "../api/lifecycle";
import { projectKeys } from "../api/query-keys";
import type { Task, TaskPriority, TaskStatus } from "../api/types";
import { TaskFields } from "./project-forms";

const tone: Record<TaskStatus, StatusTone> = {
  TODO: "pending",
  IN_PROGRESS: "info",
  IN_REVIEW: "warning",
  DONE: "success",
};

function taskActionLabel(from: TaskStatus, to: TaskStatus): string {
  if (from === "DONE" && to === "TODO") return "Reopen";
  return enumLabel(to);
}

export function TasksPanel({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: projectKeys.tasks(projectId),
    queryFn: () => listTasks(projectId),
  });
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: projectKeys.tasks(projectId) });

  const createMutation = useMutation({
    mutationFn: async (values: {
      title: string;
      priority: TaskPriority;
      dueDate?: string;
      blockedByTaskId?: string;
      assigneeId?: string;
    }) => {
      const task = await createTask(projectId, {
        title: values.title,
        priority: values.priority,
        dueDate: values.dueDate,
      });
      if (values.blockedByTaskId) {
        await updateTask(task.id, { blockedByTaskId: values.blockedByTaskId });
      }
      if (values.assigneeId) {
        await assignTask(task.id, values.assigneeId);
      }
      return task;
    },
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      pushToast({ title: "Task created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create", description: queryErrorMessage(error), tone: "danger" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      values,
    }: {
      id: string;
      values: {
        title: string;
        priority: TaskPriority;
        dueDate?: string;
        blockedByTaskId?: string;
        assigneeId?: string;
      };
    }) => {
      const task = await updateTask(id, {
        title: values.title,
        priority: values.priority,
        dueDate: values.dueDate,
        blockedByTaskId: values.blockedByTaskId ?? null,
      });
      if (values.assigneeId && values.assigneeId !== task.assigneeId) {
        await assignTask(id, values.assigneeId);
      }
      return task;
    },
    onSuccess: () => {
      invalidate();
      setEditing(null);
      pushToast({ title: "Task saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, to }: { id: string; to: TaskStatus }) => transitionTask(id, to),
    onSuccess: () => {
      invalidate();
      pushToast({ title: "Task updated", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Transition failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading tasks" />;
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Can permission="projects.manage">
          <Button onClick={() => setCreateOpen(true)}>New task</Button>
        </Can>
      </div>
      {query.data.items.length === 0 ? (
        <p className="type-helper text-steel">No tasks on this project.</p>
      ) : (
        <Table caption="Tasks">
          <TableHead>
            <TableHeaderCell>Task</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Priority</TableHeaderCell>
            <TableHeaderCell>Blocked</TableHeaderCell>
            <TableHeaderCell>Due</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {query.data.items.map((task) => {
              const next = nextTaskStatuses(task.status);
              return (
                <TableRow key={task.id}>
                  <TableCell>{task.title}</TableCell>
                  <TableCell>
                    <StatusBadge tone={tone[task.status]}>{enumLabel(task.status)}</StatusBadge>
                  </TableCell>
                  <TableCell>{enumLabel(task.priority)}</TableCell>
                  <TableCell>
                    {task.blockedByTaskId ? (
                      <StatusBadge tone="warning">Blocked</StatusBadge>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell mono>{formatDate(task.dueDate)}</TableCell>
                  <TableCell>
                    <Can permission="projects.manage">
                      <div className="flex flex-wrap gap-2">
                        {next.map((status) => (
                          <Button
                            key={status}
                            variant="secondary"
                            onClick={() => transitionMutation.mutate({ id: task.id, to: status })}
                            loading={transitionMutation.isPending}
                          >
                            {taskActionLabel(task.status, status)}
                          </Button>
                        ))}
                        <Button variant="ghost" onClick={() => setEditing(task)}>
                          Edit
                        </Button>
                      </div>
                    </Can>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New task">
        <TaskFields
          tasks={query.data.items}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
      <Drawer open={editing !== null} onClose={() => setEditing(null)} title="Edit task">
        {editing ? (
          <TaskFields
            task={editing}
            tasks={query.data.items}
            pending={updateMutation.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => updateMutation.mutate({ id: editing.id, values })}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
