"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { formatDate } from "@/features/crm/format";
import { MoneyText } from "@/features/finance/components/money-text";
import { listPayouts } from "../api/earnings-api";
import { earningsKeys } from "../api/query-keys";
import type { TeamPayoutStatus } from "../api/types";
import { EarningsQueryState } from "./earnings-query-state";

const statusTone: Record<TeamPayoutStatus, StatusTone> = {
  REQUESTED: "pending",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "warning",
  PAID: "success",
  REJECTED: "danger",
  FAILED: "danger",
};

export function PayoutsPage() {
  const [page, setPage] = useState(1);
  const filters = useMemo(() => ({ page, pageSize: 25 }), [page]);

  const list = useQuery({
    queryKey: earningsKeys.payouts.list(filters),
    queryFn: () => listPayouts(filters),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader kicker="Finance" title="Withdrawals" description="Team member payout requests, reviewed and paid here." />

      <EarningsQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No withdrawal requests"
        emptyDescription="Requests team members submit will appear here."
      >
        <Table caption="Withdrawal requests">
          <TableHead>
            <TableHeaderCell>Member</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Method</TableHeaderCell>
            <TableHeaderCell>Requested</TableHeaderCell>
            <TableHeaderCell className="text-right">Amount</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((payout) => (
              <TableRow key={payout.id}>
                <TableCell>
                  <Link className="hover:underline" href={`/finance/withdrawals/${payout.id}`}>
                    {payout.userName}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone[payout.status]}>{payout.status.replaceAll("_", " ")}</StatusBadge>
                </TableCell>
                <TableCell>{payout.payoutMethod.replaceAll("_", " ")}</TableCell>
                <TableCell mono>{formatDate(payout.requestedAt)}</TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={payout.amount} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} requests` : undefined} />
      </EarningsQueryState>
    </div>
  );
}
