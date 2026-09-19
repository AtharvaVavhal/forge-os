"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { formatTimestamp } from "@/features/crm/format";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { MoneyText } from "@/features/finance/components/money-text";
import {
  adjustProjectAllocation,
  approveProjectAllocation,
  cancelProjectAllocation,
  getProjectAllocation,
  replaceProjectAllocationLines,
} from "../api/earnings-api";
import { earningsKeys } from "../api/query-keys";
import { canAdjustProjectAllocation, canApproveProjectAllocation, canCancelProjectAllocation, isProjectAllocationEditable } from "../api/lifecycle";
import type { ProjectAllocationStatus } from "../api/types";
import { ProjectAllocationLineEditor } from "./earnings-forms";

const statusTone: Record<ProjectAllocationStatus, StatusTone> = {
  DRAFT: "pending",
  APPROVED: "success",
  CANCELLED: "neutral",
};

export function ProjectAllocationDetailPage({ id }: { id: string }) {
  return (
    <Can permission="finance.read" fallback={<ForbiddenState />}>
      <ProjectAllocationDetailInner id={id} />
    </Can>
  );
}

function ProjectAllocationDetailInner({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [linesOpen, setLinesOpen] = useState(false);
  const [confirm, setConfirm] = useState<"APPROVE" | "CANCEL" | null>(null);

  const detail = useQuery({
    queryKey: earningsKeys.projectAllocations.detail(id),
    queryFn: () => getProjectAllocation(id),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: earningsKeys.projectAllocations.detail(id) });
    queryClient.invalidateQueries({ queryKey: earningsKeys.projectAllocations.all });
  };

  const linesMutation = useMutation({
    mutationFn: (lines: Array<{ userId: string; amount: string; note?: string }>) =>
      replaceProjectAllocationLines(id, { version: detail.data?.version ?? 1, lines }),
    onSuccess: (allocation) => {
      queryClient.setQueryData(earningsKeys.projectAllocations.detail(id), allocation);
      setLinesOpen(false);
      pushToast({ title: "Lines saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save lines", description: queryErrorMessage(error), tone: "danger" }),
  });

  const approveMutation = useMutation({
    mutationFn: () => approveProjectAllocation(id, detail.data?.version ?? 1),
    onSuccess: (allocation) => {
      queryClient.setQueryData(earningsKeys.projectAllocations.detail(id), allocation);
      invalidate();
      setConfirm(null);
      pushToast({ title: "Round approved", tone: "success" });
    },
    onError: (error) => {
      setConfirm(null);
      pushToast({ title: "Couldn’t approve", description: queryErrorMessage(error), tone: "danger" });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: () => cancelProjectAllocation(id, detail.data?.version ?? 1),
    onSuccess: (allocation) => {
      queryClient.setQueryData(earningsKeys.projectAllocations.detail(id), allocation);
      invalidate();
      setConfirm(null);
      pushToast({ title: "Round cancelled", tone: "success" });
    },
    onError: (error) => {
      setConfirm(null);
      pushToast({ title: "Couldn’t cancel", description: queryErrorMessage(error), tone: "danger" });
    },
  });

  const adjustMutation = useMutation({
    mutationFn: () => adjustProjectAllocation(id),
    onSuccess: (allocation) => {
      invalidate();
      pushToast({ title: "Correction round started", tone: "success" });
      router.push(`/finance/project-allocations/${allocation.id}`);
    },
    onError: (error) => pushToast({ title: "Couldn’t start correction", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (detail.isPending) return <LoadingState label="Loading allocation" />;
  if (detail.isError && isUnauthorizedError(detail.error)) {
    return <ErrorState title="Session expired">{queryErrorMessage(detail.error)}</ErrorState>;
  }
  if (detail.isError && isForbiddenError(detail.error)) return <ForbiddenState />;
  if (detail.isError && isNotFoundError(detail.error)) {
    return <ErrorState title="Allocation not found">This round may have been removed.</ErrorState>;
  }
  if (detail.isError) return <ErrorState>{queryErrorMessage(detail.error)}</ErrorState>;

  const allocation = detail.data;
  const editable = isProjectAllocationEditable(allocation.status);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Finance"
        title={allocation.projectName}
        description={allocation.adjustmentOfId ? "Correction round" : "Normal round"}
        actions={
          <Link
            href="/finance/project-allocations"
            className="font-display text-[length:var(--text-label-size)] font-semibold text-ink underline-offset-2 hover:underline"
          >
            Back to list
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={statusTone[allocation.status]}>{allocation.status}</StatusBadge>
        {allocation.adjustmentOfId ? (
          <Link className="font-mono text-[0.75rem] text-ink/50 hover:underline" href={`/finance/project-allocations/${allocation.adjustmentOfId}`}>
            Corrects round {allocation.adjustmentOfId.slice(0, 8)}
          </Link>
        ) : null}
      </div>

      <Can permission="finance.manage">
        {confirm === null ? (
          <div className="flex flex-wrap gap-2">
            {editable ? (
              <Button variant="secondary" onClick={() => setLinesOpen(true)}>
                Edit lines
              </Button>
            ) : null}
            {canApproveProjectAllocation(allocation.status) ? (
              <Button onClick={() => setConfirm("APPROVE")}>Approve round</Button>
            ) : null}
            {canCancelProjectAllocation(allocation.status) ? (
              <Button variant="destructive" onClick={() => setConfirm("CANCEL")}>
                Cancel round
              </Button>
            ) : null}
            {canAdjustProjectAllocation(allocation.status) ? (
              <Button variant="secondary" loading={adjustMutation.isPending} onClick={() => adjustMutation.mutate()}>
                Start correction round
              </Button>
            ) : null}
          </div>
        ) : null}
      </Can>

      <Panel title="Project pool">
        <FactList
          items={[
            { label: "Revenue", value: <MoneyText value={allocation.revenue} /> },
            { label: "Expenses", value: <MoneyText value={allocation.expenses} /> },
            { label: "Distributable", value: <MoneyText value={allocation.distributable} /> },
            { label: "This round's total", value: <MoneyText value={allocation.totalAllocated} /> },
            { label: "Project cumulative approved", value: <MoneyText value={allocation.projectCumulativeApprovedTotal} /> },
            { label: "Project remaining", value: <MoneyText value={allocation.projectRemaining} /> },
            { label: "Created by", value: allocation.createdBy.name },
            { label: "Approved by", value: allocation.approvedBy?.name ?? "—" },
            { label: "Approved at", value: formatTimestamp(allocation.approvedAt) },
            { label: "Cancelled at", value: formatTimestamp(allocation.cancelledAt) },
          ]}
        />
      </Panel>

      <Panel title="Lines">
        {allocation.lines.length === 0 ? (
          <p className="text-ink/60">No lines yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {allocation.lines.map((line) => (
              <li
                key={line.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-[4px] border border-steel/20 px-3 py-3"
              >
                <div>
                  <p className="font-display text-[length:var(--text-label-size)] font-semibold text-ink">{line.userName}</p>
                  {line.note ? <p className="type-helper text-steel">{line.note}</p> : null}
                </div>
                <MoneyText value={line.amount} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Drawer open={linesOpen} onClose={() => setLinesOpen(false)} title="Edit lines">
        <ProjectAllocationLineEditor
          lines={allocation.lines}
          isAdjustment={allocation.adjustmentOfId !== null}
          pending={linesMutation.isPending}
          onCancel={() => setLinesOpen(false)}
          onSubmit={(lines) => linesMutation.mutate(lines)}
        />
      </Drawer>

      <ConfirmationDialog
        open={confirm === "APPROVE"}
        onClose={() => setConfirm(null)}
        onConfirm={() => approveMutation.mutate()}
        title="Approve this round?"
        description="Approval locks the project's pool, freezes revenue/expenses snapshots, and cannot be undone. Corrections require a new adjustment round."
        confirmLabel="Approve round"
        pending={approveMutation.isPending}
      />
      <ConfirmationDialog
        open={confirm === "CANCEL"}
        onClose={() => setConfirm(null)}
        onConfirm={() => cancelMutation.mutate()}
        title="Cancel this draft round?"
        description="This only works while the round is still a draft."
        confirmLabel="Cancel round"
        destructive
        pending={cancelMutation.isPending}
      />
    </div>
  );
}
