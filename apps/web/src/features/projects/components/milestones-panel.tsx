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
import { Modal } from "@/components/overlays/modal";
import { Field } from "@/components/forms/field";
import { Textarea } from "@/components/ui/textarea";
import { Can } from "@/features/auth/authorization/can";
import { queryErrorMessage } from "@/lib/api/query-error";
import { useToast } from "@/components/overlays/toast";
import { enumLabel, formatDate } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { createMilestone, listMilestones, transitionMilestone } from "../api/projects-api";
import { nextMilestoneStatuses, previousMilestoneStatus } from "../api/lifecycle";
import { projectKeys } from "../api/query-keys";
import type { MilestoneStatus } from "../api/types";
import { MilestoneFields } from "./project-forms";

const tone: Record<MilestoneStatus, StatusTone> = {
  PENDING: "pending",
  IN_PROGRESS: "info",
  AWAITING_APPROVAL: "warning",
  COMPLETED: "success",
};

export function MilestonesPanel({ projectId }: { projectId: string }) {
  const query = useQuery({
    queryKey: projectKeys.milestones(projectId),
    queryFn: () => listMilestones(projectId),
  });
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [revert, setRevert] = useState<{ id: string; to: MilestoneStatus } | null>(null);
  const [reason, setReason] = useState("");

  const createMutation = useMutation({
    mutationFn: (body: { name: string; dueDate?: string }) => createMilestone(projectId, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
      setCreateOpen(false);
      pushToast({ title: "Milestone created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create", description: queryErrorMessage(error), tone: "danger" }),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ id, to, reason: value }: { id: string; to: MilestoneStatus; reason?: string }) =>
      transitionMilestone(id, to, value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: projectKeys.milestones(projectId) });
      setRevert(null);
      setReason("");
      pushToast({ title: "Milestone updated", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Transition failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading milestones" />;
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Can permission="projects.manage">
          <Button onClick={() => setCreateOpen(true)}>New milestone</Button>
        </Can>
      </div>
      {query.data.items.length === 0 ? (
        <p className="type-helper text-steel">No milestones on this project.</p>
      ) : (
        <Table caption="Milestones">
          <TableHead>
            <TableHeaderCell>Milestone</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Due</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {query.data.items.map((milestone) => {
              const next = nextMilestoneStatuses(milestone.status);
              const previous = previousMilestoneStatus(milestone.status);
              return (
                <TableRow key={milestone.id}>
                  <TableCell>{milestone.name}</TableCell>
                  <TableCell>
                    <StatusBadge tone={tone[milestone.status]}>{enumLabel(milestone.status)}</StatusBadge>
                  </TableCell>
                  <TableCell mono>{formatDate(milestone.dueDate)}</TableCell>
                  <TableCell>
                    <Can permission="projects.manage">
                      <div className="flex flex-wrap gap-2">
                        {next.map((status) => (
                          <Button
                            key={status}
                            variant="secondary"
                            onClick={() => transitionMutation.mutate({ id: milestone.id, to: status })}
                            loading={transitionMutation.isPending}
                          >
                            {enumLabel(status)}
                          </Button>
                        ))}
                        {previous ? (
                          <Button variant="ghost" onClick={() => setRevert({ id: milestone.id, to: previous })}>
                            Revert
                          </Button>
                        ) : null}
                      </div>
                    </Can>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New milestone">
        <MilestoneFields
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
      <Modal
        open={revert !== null}
        onClose={() => {
          setRevert(null);
          setReason("");
        }}
        title="Revert this milestone?"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => {
                setRevert(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button
              loading={transitionMutation.isPending}
              onClick={() => revert && transitionMutation.mutate({ ...revert, reason: reason.trim() || undefined })}
            >
              Confirm revert
            </Button>
          </>
        }
      >
        <p className="type-helper mb-4 text-steel">
          POST /milestones/:id/transition accepts an optional reason. Enter one when reverting.
        </p>
        <Field id="ms-reason" label="Reason">
          <Textarea id="ms-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
