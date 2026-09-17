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
import { Field } from "@/components/forms/field";
import { Select } from "@/components/ui/select";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { Can } from "@/features/auth/authorization/can";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { queryErrorMessage } from "@/lib/api/query-error";
import { useToast } from "@/components/overlays/toast";
import { formatDate } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { deleteTimeEntry, listTasks, listTimeEntries } from "../api/projects-api";
import { projectKeys } from "../api/query-keys";
import { CreateTimeEntry } from "./work-forms";

export function TimeEntriesForProject({ projectId }: { projectId: string }) {
  const tasks = useQuery({
    queryKey: projectKeys.tasks(projectId),
    queryFn: () => listTasks(projectId),
  });
  const [taskId, setTaskId] = useState("");
  const selected = taskId || tasks.data?.items[0]?.id;

  if (tasks.isPending) return <LoadingState label="Loading tasks" />;
  if (tasks.isError) return <ErrorState>{queryErrorMessage(tasks.error)}</ErrorState>;

  return (
    <div className="flex flex-col gap-4">
      <p className="type-helper text-steel">
        Time entries are nested under `GET /tasks/:id/time-entries`. There is no cross-project time-entry list.
      </p>
      {tasks.data.items.length === 0 ? (
        <p className="type-helper text-steel">No tasks on this project to attach time to.</p>
      ) : (
        <>
          <Field id={`te-task-${projectId}`} label="Task">
            <Select
              id={`te-task-${projectId}`}
              value={selected}
              onChange={(event) => setTaskId(event.target.value)}
            >
              {tasks.data.items.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </Select>
          </Field>
          {selected ? <TimeEntriesPanel taskId={selected} /> : null}
        </>
      )}
    </div>
  );
}

export function TimeEntriesPanel({ taskId }: { taskId: string }) {
  const query = useQuery({
    queryKey: projectKeys.timeEntries(taskId),
    queryFn: () => listTimeEntries(taskId),
    enabled: Boolean(taskId),
  });
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user, can } = useAuthorization();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const canManage = can("projects.manage");

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTimeEntry(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.timeEntries(taskId) });
      setDeleting(null);
      pushToast({ title: "Time entry deleted", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t delete", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading time entries" />;
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Can permission="projects.read">
          <Button onClick={() => setOpen(true)}>Log time</Button>
        </Can>
      </div>
      {query.data.items.length === 0 ? (
        <p className="type-helper text-steel">No time entries on this task.</p>
      ) : (
        <Table caption="Time entries">
          <TableHead>
            <TableHeaderCell>Member</TableHeaderCell>
            <TableHeaderCell>Minutes</TableHeaderCell>
            <TableHeaderCell>Logged</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {query.data.items.map((entry) => {
              const canDelete = canManage || entry.userId === user.id;
              return (
                <TableRow key={entry.id}>
                  <TableCell mono>{entry.userId}</TableCell>
                  <TableCell mono>{entry.minutes}</TableCell>
                  <TableCell mono>{formatDate(entry.loggedAt)}</TableCell>
                  <TableCell>
                    {canDelete ? (
                      <Button variant="ghost" onClick={() => setDeleting(entry.id)}>
                        Delete
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <CreateTimeEntry
        taskId={taskId}
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          queryClient.invalidateQueries({ queryKey: projectKeys.timeEntries(taskId) });
          pushToast({ title: "Time logged", tone: "success" });
        }}
      />
      <ConfirmationDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting)}
        title="Delete this time entry?"
        description="Time entries have no edit endpoint. Delete and log again if the minutes are wrong."
        confirmLabel="Delete"
        destructive
        pending={deleteMutation.isPending}
      />
    </div>
  );
}
