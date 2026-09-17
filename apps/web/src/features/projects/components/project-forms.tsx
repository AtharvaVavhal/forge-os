"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormActions } from "@/features/crm/components/page-chrome";
import { projectFormSchema, taskFormSchema, timeEntryFormSchema } from "../schemas/project-forms";
import { TASK_PRIORITIES, type CompanyLike, type Project, type Task } from "./form-types";
import { enumLabel } from "@/features/crm/format";

export type { CompanyLike } from "./form-types";

export function ProjectFields({
  project,
  companies,
  pending,
  onCancel,
  onSubmit,
}: {
  project?: Project;
  companies: CompanyLike[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; companyId: string; deadline?: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = projectFormSchema.safeParse({
          name: form.get("name"),
          companyId: form.get("companyId"),
          deadline: form.get("deadline"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="project-name" label="Name" required>
        <Input id="project-name" name="name" defaultValue={project?.name} />
      </Field>
      <Field id="project-company" label="Company" required hint={project ? "Company is not on PATCH /projects/:id." : undefined}>
        {project ? <input type="hidden" name="companyId" value={project.companyId} /> : null}
        <Select
          id="project-company"
          name={project ? undefined : "companyId"}
          defaultValue={project?.companyId ?? ""}
          disabled={Boolean(project)}
        >
          <option value="">Select a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="project-deadline" label="Deadline">
        <Input id="project-deadline" name="deadline" type="date" defaultValue={project?.deadline?.slice(0, 10)} />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={project ? "Save" : "Create project"} />
    </form>
  );
}

export function MilestoneFields({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { name: string; dueDate?: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const name = String(form.get("name") ?? "").trim();
        const dueDate = String(form.get("dueDate") ?? "").trim() || undefined;
        if (!name) {
          setError("Enter a milestone name.");
          return;
        }
        setError(undefined);
        onSubmit({ name, dueDate });
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="ms-name" label="Name" required>
        <Input id="ms-name" name="name" />
      </Field>
      <Field id="ms-due" label="Due date">
        <Input id="ms-due" name="dueDate" type="date" />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Create milestone" />
    </form>
  );
}

export function TaskFields({
  task,
  tasks,
  pending,
  onCancel,
  onSubmit,
}: {
  task?: Task;
  tasks: Task[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    title: string;
    priority: (typeof TASK_PRIORITIES)[number];
    dueDate?: string;
    blockedByTaskId?: string;
    assigneeId?: string;
  }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = taskFormSchema.safeParse({
          title: form.get("title"),
          priority: form.get("priority"),
          dueDate: form.get("dueDate"),
          blockedByTaskId: form.get("blockedByTaskId"),
          assigneeId: form.get("assigneeId"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="task-title" label="Title" required>
        <Input id="task-title" name="title" defaultValue={task?.title} />
      </Field>
      <Field id="task-priority" label="Priority">
        <Select id="task-priority" name="priority" defaultValue={task?.priority ?? "MEDIUM"}>
          {TASK_PRIORITIES.map((priority) => (
            <option key={priority} value={priority}>
              {enumLabel(priority)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="task-due" label="Due date">
        <Input id="task-due" name="dueDate" type="date" defaultValue={task?.dueDate?.slice(0, 10)} />
      </Field>
      <Field id="task-blocked" label="Blocked by" hint="Side flag, not a status.">
        <Select id="task-blocked" name="blockedByTaskId" defaultValue={task?.blockedByTaskId ?? ""}>
          <option value="">Not blocked</option>
          {tasks
            .filter((item) => item.id !== task?.id)
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
        </Select>
      </Field>
      <Field id="task-assignee" label="Assignee id">
        <Input id="task-assignee" name="assigneeId" defaultValue={task?.assigneeId ?? ""} />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={task ? "Save" : "Create task"} />
    </form>
  );
}

export function TimeEntryFields({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { minutes: number; loggedAt: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = timeEntryFormSchema.safeParse({
          minutes: form.get("minutes"),
          loggedAt: form.get("loggedAt"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="te-minutes" label="Minutes" required>
        <Input id="te-minutes" name="minutes" inputMode="numeric" />
      </Field>
      <Field id="te-logged" label="Logged at" required>
        <Input id="te-logged" name="loggedAt" type="date" />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Save entry" />
    </form>
  );
}
