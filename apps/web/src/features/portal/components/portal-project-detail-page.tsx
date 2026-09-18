"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Breadcrumb } from "@/components/data-display/breadcrumb";
import { Tabs } from "@/components/data-display/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  getPortalProject,
  getPortalProjectHandover,
  getPortalProjectMilestones,
} from "../api/portal-api";
import { portalKeys } from "../api/query-keys";

export function PortalProjectDetailPage({ id }: { id: string }) {
  const [activeTab, setActiveTab] = useState("milestones");

  const projectQuery = useQuery({
    queryKey: portalKeys.projects.detail(id),
    queryFn: () => getPortalProject(id),
  });

  const milestonesQuery = useQuery({
    queryKey: portalKeys.projects.milestones(id),
    queryFn: () => getPortalProjectMilestones(id),
  });

  const handoverQuery = useQuery({
    queryKey: portalKeys.projects.handover(id),
    queryFn: () => getPortalProjectHandover(id),
  });

  const project = projectQuery.data;

  return (
    <div className="space-y-6 max-w-5xl mx-auto" data-testid="portal-project-detail-page">
      <Breadcrumb
        items={[
          { label: "Projects", href: "/portal/projects" },
          { label: project ? project.name : "Project Detail" },
        ]}
      />

      {projectQuery.isLoading && (
        <Card className="p-8 space-y-4 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-project-loading">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-48 w-full" />
        </Card>
      )}

      {projectQuery.isError && (
        <div data-testid="portal-project-error">
          <Alert tone="danger" title="Unavailable">
            {(projectQuery.error as Error)?.message || "Project could not be loaded."}
          </Alert>
        </div>
      )}

      {project && (
        <div className="space-y-6">
          {/* Project Header Card */}
          <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
                    {project.name}
                  </h1>
                  <PortalStatusBadge status={project.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--forge-ink-muted,#78736a)] mt-2">
                  <span>Current Phase: <strong className="font-mono text-[var(--forge-ink,#1a1918)]">{project.phase}</strong></span>
                  {project.deadline && (
                    <span>Deadline: {new Date(project.deadline).toLocaleDateString()}</span>
                  )}
                  {project.completedAt && (
                    <span className="text-emerald-700 font-medium">
                      Completed: {new Date(project.completedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </Card>

          {/* Navigation Tabs */}
          <Tabs
            tabs={[
              { id: "milestones", label: "Milestones" },
              { id: "handover", label: "Handover Checklist" },
            ]}
            value={activeTab}
            onChange={setActiveTab}
          />

          {/* Milestones Tab (Read-Only) */}
          {activeTab === "milestones" && (
            <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--forge-ink,#1a1918)]">
                  Project Milestones
                </h2>
                <span className="text-xs text-[var(--forge-ink-muted,#78736a)]">
                  Read-only view
                </span>
              </div>

              {milestonesQuery.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}

              {milestonesQuery.isError && (
                <Alert tone="danger" title="Unavailable">
                  Milestones are currently unavailable.
                </Alert>
              )}

              {milestonesQuery.data && milestonesQuery.data.length === 0 && (
                <p className="text-sm text-[var(--forge-ink-muted,#78736a)] py-4 text-center">
                  No milestones defined for this project.
                </p>
              )}

              {milestonesQuery.data && milestonesQuery.data.length > 0 && (
                <Table caption="Milestones">
                  <TableHead>
                    <TableHeaderCell>Milestone</TableHeaderCell>
                    <TableHeaderCell>Status</TableHeaderCell>
                    <TableHeaderCell>Due Date</TableHeaderCell>
                  </TableHead>
                  <TableBody>
                    {milestonesQuery.data.map((m) => (
                      <TableRow key={m.id}>
                        <TableCell className="font-medium text-sm">
                          {m.name}
                        </TableCell>
                        <TableCell>
                          <PortalStatusBadge status={m.status} />
                        </TableCell>
                        <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                          {m.dueDate ? new Date(m.dueDate).toLocaleDateString() : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </Card>
          )}

          {/* Handover Tab (Read-Only Checklist) */}
          {activeTab === "handover" && (
            <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--forge-ink,#1a1918)]">
                  Handover Deliverables Checklist
                </h2>
                <span className="text-xs text-[var(--forge-ink-muted,#78736a)]">
                  Read-only summary
                </span>
              </div>

              {handoverQuery.isLoading && (
                <div className="space-y-2">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-8 w-full" />
                </div>
              )}

              {handoverQuery.isError && (
                <Alert tone="danger" title="Unavailable">
                  Handover summary is currently unavailable.
                </Alert>
              )}

              {handoverQuery.data && handoverQuery.data.items.length === 0 && (
                <p className="text-sm text-[var(--forge-ink-muted,#78736a)] py-4 text-center">
                  No handover checklist items recorded.
                </p>
              )}

              {handoverQuery.data && handoverQuery.data.items.length > 0 && (
                <div className="divide-y divide-[var(--forge-border-subtle,#f0eae0)]">
                  {handoverQuery.data.items.map((item, idx) => (
                    <div key={idx} className="py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                          item.done
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-gray-100 text-gray-500"
                        }`}>
                          {item.done ? "✓" : "○"}
                        </span>
                        <span className={`text-sm ${item.done ? "line-through text-[var(--forge-ink-muted,#78736a)]" : "text-[var(--forge-ink,#1a1918)]"}`}>
                          {item.item}
                        </span>
                      </div>
                      {item.doneAt && (
                        <span className="text-xs text-[var(--forge-ink-muted,#78736a)]">
                          Completed: {new Date(item.doneAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
