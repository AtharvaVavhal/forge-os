"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel } from "@/features/crm/format";
import { SharedQueryState } from "@/features/shared/components/shared-query-state";
import { getTeamWorkload } from "../api/team-api";
import { teamKeys } from "../api/query-keys";

export function WorkloadPage() {
  const query = useQuery({
    queryKey: teamKeys.workload,
    queryFn: getTeamWorkload,
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Team"
        title="Workload"
        description="GET /team/workload. No invented filters, capacity formulas, or payout columns. Counts appear only when the API returns them."
      />
      <SharedQueryState
        isPending={query.isPending}
        isError={query.isError}
        error={query.error}
        isEmpty={query.isSuccess && query.data.rows.length === 0}
        emptyTitle="No workload rows"
        emptyDescription="Assignees appear here when the backend view includes them. This is not a zero-capacity report."
        unavailableTitle="Service is not currently available."
      >
        <Table caption="Workload by assignee">
          <TableHead>
            <TableHeaderCell>Member</TableHeaderCell>
            <TableHeaderCell>Role</TableHeaderCell>
            <TableHeaderCell className="text-right">Open tasks</TableHeaderCell>
            <TableHeaderCell className="text-right">Time entries</TableHeaderCell>
          </TableHead>
          <TableBody>
            {query.data?.rows.map((row) => (
              <TableRow key={row.userId}>
                <TableCell>
                  <p>{row.name ?? row.email ?? row.userId}</p>
                  {row.email && row.name ? <p className="type-metadata text-steel">{row.email}</p> : null}
                </TableCell>
                <TableCell>{row.role ? enumLabel(row.role) : "—"}</TableCell>
                <TableCell mono className="text-right">
                  {row.openTaskCount ?? "—"}
                </TableCell>
                <TableCell mono className="text-right">
                  {row.timeEntryCount ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SharedQueryState>
    </div>
  );
}
