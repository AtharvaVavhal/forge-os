"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { Pagination } from "@/components/data-display/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Drawer } from "@/components/overlays/drawer";
import { useToast } from "@/components/overlays/toast";
import { queryErrorMessage } from "@/lib/api/query-error";
import {
  createPortalSupportTicket,
  listPortalProjects,
  listPortalSupportTickets,
} from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import type { PortalSupportTicket } from "../types";
import { PortalStatusBadge } from "./portal-status-badge";

export function PortalSupportPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<PortalSupportTicket | null>(null);
  const [subject, setSubject] = useState("");
  const [projectId, setProjectId] = useState("");
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const filters = useMemo(() => ({ page, pageSize: 25 }), [page]);

  const list = useQuery({
    queryKey: portalKeys.supportTickets.list(filters),
    queryFn: () => listPortalSupportTickets(filters),
  });

  const projects = useQuery({
    queryKey: portalKeys.projects.list({ page: 1, pageSize: 100 }),
    queryFn: () => listPortalProjects({ page: 1, pageSize: 100 }),
    enabled: createOpen,
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createPortalSupportTicket({
        projectId,
        subject: subject.trim(),
      }),
    onSuccess: (ticket) => {
      queryClient.invalidateQueries({ queryKey: portalKeys.supportTickets.all });
      setCreateOpen(false);
      setSubject("");
      setProjectId("");
      setSelected(ticket);
      pushToast({ title: "Support ticket created", tone: "success" });
    },
    onError: (error) =>
      pushToast({
        title: "Could not create ticket",
        description: queryErrorMessage(error),
        tone: "danger",
      }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data
    ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize))
    : 1;

  return (
    <div className="space-y-6" data-testid="portal-support-page">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
            Support
          </h1>
          <p className="text-sm text-[var(--forge-ink-muted,#78736a)] mt-1">
            Raise tickets for your company&apos;s projects. Tickets stay scoped to your organization.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} data-testid="portal-support-create">
          New ticket
        </Button>
      </div>

      {list.isPending && (
        <Card className="p-6 space-y-3" data-testid="portal-support-loading">
          <Skeleton className="h-6 w-1/3" />
          <Skeleton className="h-24 w-full" />
        </Card>
      )}

      {list.isError && (
        <Alert tone="danger" title="Unavailable">
          Support tickets could not be loaded.
        </Alert>
      )}

      {list.data && list.data.items.length === 0 && (
        <Card
          className="p-8 text-center text-sm text-[var(--forge-ink-muted,#78736a)]"
          data-testid="portal-support-empty"
        >
          No support tickets yet for your company.
        </Card>
      )}

      {list.data && list.data.items.length > 0 && (
        <Card className="p-0 overflow-hidden bg-white border-[var(--forge-border,#e5dfd5)]">
          <Table caption="Support tickets">
            <TableHead>
              <TableHeaderCell>Subject</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Created</TableHeaderCell>
              <TableHeaderCell>Actions</TableHeaderCell>
            </TableHead>
            <TableBody>
              {list.data.items.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell className="font-medium text-sm">{ticket.subject}</TableCell>
                  <TableCell>
                    <PortalStatusBadge status={ticket.status} />
                  </TableCell>
                  <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                    {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <button
                      type="button"
                      className="text-sm font-semibold hover:underline"
                      onClick={() => setSelected(ticket)}
                      data-testid={`portal-support-view-${ticket.id}`}
                    >
                      View
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="p-4 border-t border-[var(--forge-border-subtle,#f0eae0)]">
            <Pagination
              page={list.data.page}
              pageCount={pageCount}
              onPageChange={setPage}
              summary={total ? `${total} tickets` : undefined}
            />
          </div>
        </Card>
      )}

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New support ticket">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!projectId || !subject.trim()) return;
            createMutation.mutate();
          }}
        >
          <Field id="support-project" label="Project" required>
            <Select
              id="support-project"
              name="projectId"
              value={projectId}
              onChange={(event) => setProjectId(event.target.value)}
              required
            >
              <option value="">Select a project</option>
              {(projects.data?.items ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="support-subject" label="Subject" required>
            <Input
              id="support-subject"
              name="subject"
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              maxLength={500}
              required
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={createMutation.isPending}
              disabled={!projectId || !subject.trim()}
            >
              Create ticket
            </Button>
          </div>
        </form>
      </Drawer>

      <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="Ticket details">
        {selected ? (
          <div className="space-y-4 text-sm" data-testid="portal-support-detail">
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--forge-ink-muted,#78736a)]">
                Subject
              </div>
              <div className="font-medium mt-1">{selected.subject}</div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-[var(--forge-ink-muted,#78736a)]">
                Status
              </span>
              <PortalStatusBadge status={selected.status} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-wider text-[var(--forge-ink-muted,#78736a)]">
                Project
              </div>
              <Link
                href={`/portal/projects/${selected.projectId}`}
                className="font-semibold hover:underline mt-1 inline-block"
              >
                Open project
              </Link>
            </div>
            <div className="text-[var(--forge-ink-muted,#78736a)]">
              Created{" "}
              {selected.createdAt ? new Date(selected.createdAt).toLocaleString() : "—"}
              {selected.resolvedAt
                ? ` · Resolved ${new Date(selected.resolvedAt).toLocaleString()}`
                : null}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
