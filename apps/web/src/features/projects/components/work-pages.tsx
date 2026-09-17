"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Field } from "@/components/forms/field";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { ResourceQueryState } from "@/features/crm/components/resource-query-state";
import { listProjects } from "../api/projects-api";
import { projectKeys } from "../api/query-keys";
import { MilestonesPanel } from "./milestones-panel";
import { TasksPanel } from "./tasks-panel";
import { TimeEntriesForProject } from "./time-entries-panel";

function ProjectPicker({
  kicker,
  title,
  description,
  fieldId,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  fieldId: string;
  children: (projectId: string) => ReactNode;
}) {
  const [projectId, setProjectId] = useState("");
  const filters = useMemo(() => ({ page: 1, pageSize: 100, sort: "createdAt:desc" }), []);
  const list = useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: () => listProjects(filters),
  });
  const selected = projectId || list.data?.items[0]?.id;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader kicker={kicker} title={title} description={description} />
      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No projects"
        emptyDescription="These records are nested under a project. There is no top-level list endpoint."
      >
        <Field id={fieldId} label="Project">
          <Select
            id={fieldId}
            value={selected ?? ""}
            onChange={(event) => setProjectId(event.target.value)}
          >
            {list.data?.items.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </Select>
        </Field>
        {selected ? children(selected) : null}
      </ResourceQueryState>
    </div>
  );
}

export function MilestonesIndexPage() {
  return (
    <ProjectPicker
      kicker="Delivery"
      title="Milestones"
      fieldId="milestones-project"
      description="Milestones are listed with GET /projects/:id/milestones. Pick a project — there is no GET /milestones."
    >
      {(projectId) => <MilestonesPanel projectId={projectId} />}
    </ProjectPicker>
  );
}

export function TasksIndexPage() {
  return (
    <ProjectPicker
      kicker="Delivery"
      title="Tasks"
      fieldId="tasks-project"
      description="Tasks are listed with GET /projects/:id/tasks. Pick a project — there is no GET /tasks."
    >
      {(projectId) => <TasksPanel projectId={projectId} />}
    </ProjectPicker>
  );
}

export function TimeEntriesIndexPage() {
  return (
    <ProjectPicker
      kicker="Delivery"
      title="Time entries"
      fieldId="time-entries-project"
      description="Time entries are listed with GET /tasks/:id/time-entries. Pick a project, then a task."
    >
      {(projectId) => <TimeEntriesForProject projectId={projectId} />}
    </ProjectPicker>
  );
}
