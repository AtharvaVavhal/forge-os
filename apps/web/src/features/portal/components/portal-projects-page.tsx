"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPortalProjects } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";

export function PortalProjectsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.projects.list(),
    queryFn: () => listPortalProjects(),
  });

  return (
    <div className="space-y-6" data-testid="portal-projects-page">
      <div className="border-b border-[var(--forge-border,#e5dfd5)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
          Projects
        </h1>
        <p className="text-sm text-[var(--forge-ink-muted,#78736a)] mt-1">
          Track project milestones, phases, and handover deliverables.
        </p>
      </div>

      {isLoading && (
        <Card className="p-6 space-y-3 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-projects-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Card>
      )}

      {isError && (
        <Alert variant="danger" title="Service Unavailable" data-testid="portal-projects-error">
          {(error as Error)?.message || "Projects service is currently unavailable."}
        </Alert>
      )}

      {data && data.items.length === 0 && (
        <Card className="p-12 text-center bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-projects-empty">
          <p className="text-sm text-[var(--forge-ink-muted,#78736a)]">
            No active projects found for your company.
          </p>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden bg-white border-[var(--forge-border,#e5dfd5)]">
          <Table caption="Projects">
            <TableHead>
              <TableHeaderCell>Project Name</TableHeaderCell>
              <TableHeaderCell>Phase</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Deadline</TableHeaderCell>
              <TableHeaderCell className="text-right">Action</TableHeaderCell>
            </TableHead>
            <TableBody>
              {data.items.map((project) => (
                <TableRow key={project.id} data-testid={`portal-project-row-${project.id}`}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/portal/projects/${project.id}`}
                      className="text-[var(--forge-ink,#1a1918)] hover:underline text-sm font-semibold"
                    >
                      {project.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-sm font-mono text-[var(--forge-ink-muted,#78736a)]">
                    {project.phase}
                  </TableCell>
                  <TableCell>
                    <PortalStatusBadge status={project.status} />
                  </TableCell>
                  <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                    {project.deadline ? new Date(project.deadline).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/portal/projects/${project.id}`}
                      className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
                    >
                      View &rarr;
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
