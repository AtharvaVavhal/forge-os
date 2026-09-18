"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { formatTimestamp } from "@/features/crm/format";
import { cn } from "@/lib/cn";
import { listFinanceKyc } from "../api/kyc-api";
import { financeKeys } from "../api/query-keys";
import type { KycReviewStatus } from "../api/kyc-types";
import { FinanceQueryState } from "./finance-query-state";

const statusTone: Record<KycReviewStatus, StatusTone> = {
  UNDER_REVIEW: "info",
  REJECTED: "danger",
  VERIFIED: "success",
};

const STATUS_TABS: { value: KycReviewStatus; label: string }[] = [
  { value: "UNDER_REVIEW", label: "Under review" },
  { value: "REJECTED", label: "Rejected" },
  { value: "VERIFIED", label: "Verified" },
];

export function KycReviewListPage() {
  return (
    <Can permission="finance.manage" fallback={<ForbiddenState />}>
      <KycReviewListInner />
    </Can>
  );
}

function KycReviewListInner() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<KycReviewStatus>("UNDER_REVIEW");
  const filters = useMemo(() => ({ page, pageSize: 25, status }), [page, status]);

  const list = useQuery({
    queryKey: financeKeys.kyc.list(filters),
    queryFn: () => listFinanceKyc(filters),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data
    ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize))
    : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Finance"
        title="KYC Review"
        description="Review team member identity submissions before payouts."
      />

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="KYC status">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={status === tab.value}
            onClick={() => {
              setStatus(tab.value);
              setPage(1);
            }}
            className={cn(
              "rounded-[4px] border px-3 py-2 font-display text-[length:var(--text-label-size)] font-semibold",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              status === tab.value
                ? "border-ink bg-ink text-paper"
                : "border-steel/20 text-ink hover:bg-ink/[0.04]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <FinanceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No KYC profiles"
        emptyDescription={
          status === "UNDER_REVIEW"
            ? "Nothing waiting for review."
            : "No profiles in this status."
        }
      >
        <Table caption="KYC review queue">
          <TableHead>
            <TableHeaderCell>Member</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Submitted</TableHeaderCell>
            <TableHeaderCell>Action</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((row) => (
              <TableRow key={row.id}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-ink">{row.memberName}</span>
                    <span className="font-mono text-[0.75rem] text-ink/50">{row.memberEmail}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={statusTone[row.status]}>
                    {row.status.replaceAll("_", " ")}
                  </StatusBadge>
                </TableCell>
                <TableCell mono>{row.submittedAt ? formatTimestamp(row.submittedAt) : "—"}</TableCell>
                <TableCell>
                  <Link
                    href={`/finance/kyc/${row.id}`}
                    className="font-display text-[length:var(--text-label-size)] font-semibold text-ink underline-offset-2 hover:underline"
                  >
                    Review
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={total ? `${total} profiles` : undefined}
        />
      </FinanceQueryState>
    </div>
  );
}
