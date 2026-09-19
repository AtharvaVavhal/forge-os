"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Drawer } from "@/components/overlays/drawer";
import { Can } from "@/features/auth/authorization/can";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { formatDate } from "@/features/crm/format";
import { queryErrorMessage } from "@/lib/api/query-error";
import { useToast } from "@/components/overlays/toast";
import { MoneyText } from "@/features/finance/components/money-text";
import { createProjectAllocation, listProjectAllocations } from "../api/earnings-api";
import { earningsKeys } from "../api/query-keys";
import type { ProjectAllocationStatus } from "../api/types";
import { EarningsQueryState } from "./earnings-query-state";
import { CreateProjectAllocationFields } from "./earnings-forms";

const statusTone: Record<ProjectAllocationStatus, StatusTone> = {
  DRAFT: "pending",
  APPROVED: "success",
  CANCELLED: "neutral",
};

export function ProjectAllocationsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const filters = useMemo(() => ({ page, pageSize: 25 }), [page]);

  const list = useQuery({
    queryKey: earningsKeys.projectAllocations.list(filters),
    queryFn: () => listProjectAllocations(filters),
  });

  const create = useMutation({
    mutationFn: (projectId: string) => createProjectAllocation({ projectId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningsKeys.projectAllocations.all });
      setCreateOpen(false);
      pushToast({ title: "Allocation round created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create round", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Finance"
        title="Project Allocations"
        description="Revenue distributed to team members, one approval round at a time."
        actions={
          <Can permission="finance.manage">
            <Button onClick={() => setCreateOpen(true)}>New allocation round</Button>
          </Can>
        }
      />

      <EarningsQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No allocation rounds"
        emptyDescription="Create a round against a project to start distributing its revenue."
      >
        <Table caption="Project allocations">
          <TableHead>
            <TableHeaderCell>Project</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Kind</TableHeaderCell>
            <TableHeaderCell>Approved</TableHeaderCell>
            <TableHeaderCell className="text-right">Total</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((allocation) => (
              <TableRow key={allocation.id}>
                <TableCell>
                  <Link className="hover:underline" href={`/finance/project-allocations/${allocation.id}`}>
                    {allocation.projectName}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone[allocation.status]}>{allocation.status}</StatusBadge>
                </TableCell>
                <TableCell>{allocation.adjustmentOfId ? "Adjustment" : "Normal"}</TableCell>
                <TableCell mono>{allocation.approvedAt ? formatDate(allocation.approvedAt) : "—"}</TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={allocation.totalAllocated} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} rounds` : undefined} />
      </EarningsQueryState>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New allocation round">
        <CreateProjectAllocationFields
          pending={create.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(projectId) => create.mutate(projectId)}
        />
      </Drawer>
    </div>
  );
}
