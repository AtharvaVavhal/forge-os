"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
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
import { useToast } from "@/components/overlays/toast";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { ForbiddenAlert } from "@/features/auth/components/forbidden-alert";
import { isForbiddenError } from "@/features/auth/api/classify-auth-error";
import { queryErrorMessage, isNotFoundError } from "@/lib/api/query-error";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import {
  createForgeFundEntry,
  getForgeFundBalance,
  listForgeFundEntries,
} from "../api/finance-api";
import { financeKeys } from "../api/query-keys";
import type { ForgeFundEntryType } from "../api/types";
import { FinanceQueryState } from "./finance-query-state";
import { MoneyText } from "./money-text";
import { ForgeFundFields } from "./finance-forms";

const typeTone: Record<ForgeFundEntryType, StatusTone> = {
  CONTRIBUTION: "success",
  WITHDRAWAL: "warning",
  ALLOCATION: "info",
};

export function ForgeFundPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<{
    type: ForgeFundEntryType;
    amount: string;
    reason: string;
  } | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { can } = useAuthorization();
  const canPost = can("forge_fund.manage") && can("forge_fund.approve");
  const filters = useMemo(() => ({ page, pageSize: 25, sort: "createdAt:desc" }), [page]);

  const balance = useQuery({
    queryKey: financeKeys.forgeFund.balance,
    queryFn: getForgeFundBalance,
  });
  const list = useQuery({
    queryKey: financeKeys.forgeFund.entries(filters),
    queryFn: () => listForgeFundEntries(filters),
  });

  const createMutation = useMutation({
    mutationFn: (body: { type: ForgeFundEntryType; amount: string; reason: string }) =>
      createForgeFundEntry({ ...body, sourceType: null, sourceId: null }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.forgeFund.all });
      setPendingEntry(null);
      setCreateOpen(false);
      pushToast({ title: "Ledger entry posted", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t post entry", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;
  const balanceUnavailable = balance.isError && isNotFoundError(balance.error);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Treasury"
        title="Forge Fund"
        description="ForgeFundEntry ledger only. No payout, TeamPayout, or member-balance entity."
        actions={
          canPost ? (
            <Button onClick={() => setCreateOpen(true)}>Manual entry</Button>
          ) : null
        }
      />

      <Panel title="Balance">
        {balance.isPending ? (
          <LoadingState label="Loading balance" />
        ) : balanceUnavailable ? (
          <ErrorState title="Finance service is not currently available.">
            GET /forge-fund/balance is specified but not mounted. This is not a ₹0 fund.
          </ErrorState>
        ) : balance.isError && isForbiddenError(balance.error) ? (
          <ForbiddenAlert />
        ) : balance.isError ? (
          <ErrorState>{queryErrorMessage(balance.error)}</ErrorState>
        ) : (
          <p className="type-page-title text-ink">
            {balance.data ? <MoneyText value={balance.data} /> : "—"}
          </p>
        )}
        {!balance.data && balance.isSuccess ? (
          <p className="type-helper mt-2 text-steel">Awaiting live data — balance is not derived from this page of entries.</p>
        ) : null}
      </Panel>

      <FinanceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No ledger entries"
        emptyDescription="Contributions, withdrawals, and allocations appear here. This is not a zero balance."
      >
        <Table caption="Forge Fund ledger">
          <TableHead>
            <TableHeaderCell>Type</TableHeaderCell>
            <TableHeaderCell>Reason</TableHeaderCell>
            <TableHeaderCell>Source</TableHeaderCell>
            <TableHeaderCell>Approved by</TableHeaderCell>
            <TableHeaderCell>When</TableHeaderCell>
            <TableHeaderCell className="text-right">Amount</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell>
                  <StatusBadge tone={typeTone[entry.type]}>{enumLabel(entry.type)}</StatusBadge>
                </TableCell>
                <TableCell>{entry.reason}</TableCell>
                <TableCell mono>
                  {entry.sourceType && entry.sourceId ? `${entry.sourceType}:${entry.sourceId}` : "Manual"}
                </TableCell>
                <TableCell mono>{entry.approvedBy ?? "—"}</TableCell>
                <TableCell mono>{formatTimestamp(entry.createdAt)}</TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={entry.amount} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} entries` : undefined} />
      </FinanceQueryState>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Manual Forge Fund entry">
        <ForgeFundFields
          pending={false}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => {
            setPendingEntry(values);
            setCreateOpen(false);
          }}
        />
      </Drawer>
      <ConfirmationDialog
        open={pendingEntry !== null}
        onClose={() => setPendingEntry(null)}
        onConfirm={() => pendingEntry && createMutation.mutate(pendingEntry)}
        title="Post this ledger entry?"
        description="Approval is the act of creating the row. There is no payout state machine."
        confirmLabel="Post entry"
        pending={createMutation.isPending}
      />
    </div>
  );
}
