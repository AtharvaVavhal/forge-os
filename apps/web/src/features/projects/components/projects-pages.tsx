"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import { Tabs, TabPanel } from "@/components/data-display/tabs";
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
import { ConfirmationDialog } from "@/components/overlays/modal";
import { Panel } from "@/components/ui/panel";
import { Checkbox } from "@/components/ui/checkbox";
import { Select } from "@/components/ui/select";
import { Field } from "@/components/forms/field";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { listCompanies } from "@/features/crm/api/crm-api";
import { crmKeys } from "@/features/crm/api/query-keys";
import { ActivityFeed } from "@/features/crm/components/activity-feed";
import { NotesPanel } from "@/features/shared/components/notes-panel";
import { DocumentsPanel } from "@/features/shared/components/documents-panel";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { ResourceQueryState } from "@/features/crm/components/resource-query-state";
import { enumLabel, formatDate } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import {
  completeProject,
  createProject,
  getProject,
  listMilestones,
  listProjects,
  transitionProjectPhase,
  transitionProjectStatus,
  updateHandoverChecklist,
  updateProject,
} from "../api/projects-api";
import {
  isPhaseSkip,
  nextProjectPhase,
  nextProjectStatuses,
} from "../api/lifecycle";
import { projectKeys } from "../api/query-keys";
import { PROJECT_PHASES, type HandoverItem, type ProjectPhase, type ProjectStatus } from "../api/types";
import { ProjectFields } from "./project-forms";
import { MilestonesPanel } from "./milestones-panel";
import { TasksPanel } from "./tasks-panel";
import { TimeEntriesForProject } from "./time-entries-panel";

const statusTone: Record<ProjectStatus, StatusTone> = {
  ACTIVE: "success",
  ON_HOLD: "warning",
  AT_RISK: "danger",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
};

export function ProjectsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();
  const { user } = useAuthorization();

  const filters = useMemo(() => ({ page, pageSize: 25, sort: "createdAt:desc" }), [page]);
  const list = useQuery({
    queryKey: projectKeys.list(filters),
    queryFn: () => listProjects(filters),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100, sort: "createdAt:desc" }),
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; companyId: string; deadline?: string }) =>
      createProject({ ...body, ownerId: user.id }),
    onSuccess: (project) => {
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setCreateOpen(false);
      pushToast({ title: "Project created", tone: "success" });
      router.push(`/projects/${project.id}`);
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t create project", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Delivery"
        title="Projects"
        description="Status and phase change through command endpoints. No archive/delete."
        actions={
          <Can permission="projects.manage">
            <Button onClick={() => setCreateOpen(true)}>New project</Button>
          </Can>
        }
      />
      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No projects"
        emptyDescription="Projects usually appear when a deal is won. Manual create is for rare pro-bono work."
      >
        <Table caption="Projects">
          <TableHead>
            <TableHeaderCell>Project</TableHeaderCell>
            <TableHeaderCell>Client</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Phase</TableHeaderCell>
            <TableHeaderCell>Deadline</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link href={`/projects/${project.id}`} className="font-semibold hover:underline">
                    {project.name}
                  </Link>
                </TableCell>
                <TableCell>{project.company?.name ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone[project.status]}>{enumLabel(project.status)}</StatusBadge>
                </TableCell>
                <TableCell>{enumLabel(project.phase)}</TableCell>
                <TableCell mono>{formatDate(project.deadline)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} projects` : undefined} />
      </ResourceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New project">
        <ProjectFields
          companies={companies.data?.items ?? []}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
    </div>
  );
}

export function ProjectDetailPage({ id }: { id: string }) {
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [skipTo, setSkipTo] = useState<ProjectPhase | "">("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuthorization();

  const query = useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: () => getProject(id),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100, sort: "createdAt:desc" }),
  });
  const milestones = useQuery({
    queryKey: projectKeys.milestones(id),
    queryFn: () => listMilestones(id),
    enabled: tab === "milestones" || tab === "overview",
  });
  const updateMutation = useMutation({
    mutationFn: (body: { name: string; deadline?: string }) => updateProject(id, body),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setEditing(false);
      pushToast({ title: "Project saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const statusMutation = useMutation({
    mutationFn: (to: ProjectStatus) => transitionProjectStatus(id, to),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      pushToast({ title: `Status ${enumLabel(project.status).toLowerCase()}`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Status change failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const phaseMutation = useMutation({
    mutationFn: ({ to, override }: { to: ProjectPhase; override?: boolean }) =>
      transitionProjectPhase(id, to, override),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      setSkipTo("");
      pushToast({ title: `Phase ${enumLabel(project.phase).toLowerCase()}`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Phase change failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const handoverMutation = useMutation({
    mutationFn: (items: HandoverItem[]) => updateHandoverChecklist(id, items),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      pushToast({ title: "Handover updated", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Handover failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const completeMutation = useMutation({
    mutationFn: () => completeProject(id),
    onSuccess: (project) => {
      queryClient.setQueryData(projectKeys.detail(id), project);
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      setCompleteOpen(false);
      pushToast({ title: "Project completed", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Complete failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading project" />;
  if (query.isError && (isNotFoundError(query.error) || isForbiddenError(query.error) || isUnauthorizedError(query.error))) {
    return <ForbiddenState />;
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const project = query.data;
  const statuses = nextProjectStatuses(project.status);
  const nextPhase = nextProjectPhase(project.phase);
  const checklistDone = project.handoverChecklist.length > 0 && project.handoverChecklist.every((item) => item.done);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-steel/15 pb-6">
        <p className="type-mono-label text-steel">Project</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="type-page-title text-ink">{project.name}</h1>
          <Can permission="projects.manage">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
          </Can>
        </div>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="type-mono-label text-steel">Client</dt>
            <dd className="mt-1 text-ink">
              {project.company ? (
                <Link className="hover:underline" href={`/crm/companies/${project.company.id}`}>
                  {project.company.name}
                </Link>
              ) : (
                "—"
              )}
            </dd>
          </div>
          <div>
            <dt className="type-mono-label text-steel">Status</dt>
            <dd className="mt-1">
              <StatusBadge tone={statusTone[project.status]}>{enumLabel(project.status)}</StatusBadge>
            </dd>
          </div>
          <div>
            <dt className="type-mono-label text-steel">Phase</dt>
            <dd className="mt-1 type-body text-ink">{enumLabel(project.phase)}</dd>
          </div>
        </dl>
      </header>

      <Can permission="projects.manage">
        {project.status !== "COMPLETED" && project.status !== "CANCELLED" ? (
          <div className="flex flex-wrap gap-2">
            {statuses.map((status) => (
              <Button
                key={status}
                variant={status === "CANCELLED" ? "destructive" : "secondary"}
                onClick={() => statusMutation.mutate(status)}
                loading={statusMutation.isPending}
              >
                {enumLabel(status)}
              </Button>
            ))}
            {nextPhase ? (
              <Button
                onClick={() => phaseMutation.mutate({ to: nextPhase })}
                loading={phaseMutation.isPending}
              >
                Advance to {enumLabel(nextPhase)}
              </Button>
            ) : null}
            {project.status === "ACTIVE" ? (
              <Button variant="secondary" onClick={() => setCompleteOpen(true)}>
                Complete
              </Button>
            ) : null}
          </div>
        ) : null}
      </Can>

      <Tabs
        tabs={[
          { id: "overview", label: "Overview" },
          { id: "milestones", label: "Milestones" },
          { id: "tasks", label: "Tasks" },
          { id: "time", label: "Time entries" },
          { id: "activity", label: "Activity" },
          { id: "notes", label: "Notes" },
          { id: "documents", label: "Documents" },
          { id: "handover", label: "Handover" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <TabPanel id="overview" active={tab === "overview"}>
        <FactList
          items={[
            { label: "Owner", value: project.ownerId },
            { label: "Deadline", value: formatDate(project.deadline) },
            {
              label: "Deal",
              value: project.dealId ? (
                <Link className="hover:underline" href={`/crm/deals/${project.dealId}`}>
                  Open deal
                </Link>
              ) : (
                "—"
              ),
            },
            {
              label: "Accepted proposal",
              value: project.acceptedProposalId ? (
                <Link className="hover:underline" href={`/projects/proposals/${project.acceptedProposalId}`}>
                  Open proposal
                </Link>
              ) : (
                "—"
              ),
            },
            { label: "Milestones", value: milestones.data ? String(milestones.data.items.length) : "—" },
          ]}
        />
        <Can permission="projects.manage">
          <div className="mt-6 max-w-sm">
            <Field id="phase-skip" label="Skip to phase" hint="Sends override:true. Backend still enforces gates.">
              <Select
                id="phase-skip"
                value={skipTo}
                onChange={(event) => setSkipTo(event.target.value as ProjectPhase | "")}
              >
                <option value="">Select phase</option>
                {PROJECT_PHASES.filter((phase) => isPhaseSkip(project.phase, phase)).map((phase) => (
                  <option key={phase} value={phase}>
                    {enumLabel(phase)}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              className="mt-3"
              variant="secondary"
              disabled={!skipTo}
              onClick={() => skipTo && phaseMutation.mutate({ to: skipTo, override: true })}
              loading={phaseMutation.isPending}
            >
              Skip with override
            </Button>
          </div>
        </Can>
      </TabPanel>

      <TabPanel id="milestones" active={tab === "milestones"}>
        <MilestonesPanel projectId={id} />
      </TabPanel>
      <TabPanel id="tasks" active={tab === "tasks"}>
        <TasksPanel projectId={id} />
      </TabPanel>
      <TabPanel id="time" active={tab === "time"}>
        <TimeEntriesForProject projectId={id} />
      </TabPanel>
      <TabPanel id="activity" active={tab === "activity"}>
        <ActivityFeed projectId={project.id} />
      </TabPanel>
      <TabPanel id="notes" active={tab === "notes"}>
        <NotesPanel parent={{ projectId: project.id }} />
      </TabPanel>
      <TabPanel id="documents" active={tab === "documents"}>
        <DocumentsPanel parent={{ projectId: project.id }} />
      </TabPanel>
      <TabPanel id="handover" active={tab === "handover"}>
        <Panel title="Handover checklist">
          {project.handoverChecklist.length === 0 ? (
            <p className="type-helper text-steel">No checklist items on this project yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {project.handoverChecklist.map((item, index) => (
                <li key={`${item.item}-${index}`} className="border-t border-steel/15 pt-3">
                  <Can
                    permission="projects.manage"
                    fallback={
                      <p className="type-body text-ink">
                        {item.done ? "Done — " : "Open — "}
                        {item.item}
                      </p>
                    }
                  >
                    <Checkbox
                      label={item.item}
                      checked={item.done}
                      onChange={(event) => {
                        const items = project.handoverChecklist.map((entry, entryIndex) =>
                          entryIndex === index
                            ? {
                                ...entry,
                                done: event.target.checked,
                                doneAt: event.target.checked ? new Date().toISOString() : null,
                                doneBy: event.target.checked ? user.id : null,
                              }
                            : entry
                        );
                        handoverMutation.mutate(items);
                      }}
                    />
                  </Can>
                  {item.done ? (
                    <p className="type-metadata mt-1 text-steel">
                      {item.doneBy ?? "—"} · {formatDate(item.doneAt)}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <p className="type-helper mt-4 text-steel">
            Completion requires every item `done: true`. JSONB checklist only — no relational items.
          </p>
        </Panel>
      </TabPanel>

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit project">
        <ProjectFields
          project={project}
          companies={companies.data?.items ?? []}
          pending={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateMutation.mutate({ name: values.name, deadline: values.deadline })}
        />
      </Drawer>
      <ConfirmationDialog
        open={completeOpen}
        onClose={() => setCompleteOpen(false)}
        onConfirm={() => completeMutation.mutate()}
        title="Complete this project?"
        description={
          checklistDone
            ? "POST /projects/:id/complete requires the handover checklist to be fully done."
            : "The backend will reject completion until every handover item is done."
        }
        confirmLabel="Complete project"
        pending={completeMutation.isPending}
      />
    </div>
  );
}
