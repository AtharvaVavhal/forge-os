"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { useToast } from "@/components/overlays/toast";
import { queryErrorMessage } from "@/lib/api/query-error";
import { isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { formatDate } from "@/features/crm/format";
import { formatInr } from "@/lib/money/format-inr";
import { MoneyText } from "@/features/finance/components/money-text";
import {
  createOwnPayoutRequest,
  getOwnEarningsSummary,
  listOwnEarningAllocations,
  listOwnPayouts,
} from "../api/earnings-api";
import { earningsKeys } from "../api/query-keys";
import { withdrawFundsFormSchema } from "../schemas/forms";
import { EarningsQueryState } from "./earnings-query-state";
import type { TeamPayoutStatus } from "../api/types";

const payoutTone: Record<TeamPayoutStatus, StatusTone> = {
  REQUESTED: "pending",
  UNDER_REVIEW: "info",
  APPROVED: "info",
  PROCESSING: "warning",
  PAID: "success",
  REJECTED: "danger",
  FAILED: "danger",
};

function StatTile({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="border-t border-steel/15 pt-3">
      <dt className="type-mono-label text-steel">{label}</dt>
      <dd className="font-display mt-1 text-[length:var(--text-section-title-size)] font-bold tabular-nums text-ink">
        <MoneyText value={value} />
      </dd>
      {helper ? <p className="type-helper mt-1 text-steel">{helper}</p> : null}
    </div>
  );
}

/**
 * K12 self-service Earnings tab (Settings → Profile). Every figure here is a
 * server-computed decimal string rendered as-is through `MoneyText` — no
 * addition/subtraction/comparison happens in this component. `recoveryOwed`
 * is never requested or shown; it's Finance-only.
 */
export function TeamEarningsTab() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [amountError, setAmountError] = useState<string | undefined>();
  const [pendingAmount, setPendingAmount] = useState<string | null>(null);

  const summary = useQuery({
    queryKey: earningsKeys.team.summary,
    queryFn: getOwnEarningsSummary,
  });
  const recentEarnings = useQuery({
    queryKey: earningsKeys.team.allocations({ page: 1, pageSize: 10 }),
    queryFn: () => listOwnEarningAllocations({ page: 1, pageSize: 10 }),
  });
  const payouts = useQuery({
    queryKey: earningsKeys.team.payouts.list({ page: 1, pageSize: 10 }),
    queryFn: () => listOwnPayouts({ page: 1, pageSize: 10 }),
  });

  const withdraw = useMutation({
    mutationFn: (value: string) => createOwnPayoutRequest(value),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: earningsKeys.team.summary });
      queryClient.invalidateQueries({ queryKey: earningsKeys.team.payouts.all });
      setPendingAmount(null);
      setAmount("");
      pushToast({ title: "Withdrawal requested", tone: "success" });
    },
    onError: (error) => {
      setPendingAmount(null);
      pushToast({ title: "Couldn’t request withdrawal", description: queryErrorMessage(error), tone: "danger" });
    },
  });

  if (summary.isPending) {
    return (
      <Card>
        <CardHeader kicker="Settings" title="Earnings" />
        <LoadingState label="Loading earnings" />
      </Card>
    );
  }
  if (summary.isError) {
    if (isUnauthorizedError(summary.error)) {
      return <ErrorState title="Session expired">{queryErrorMessage(summary.error)}</ErrorState>;
    }
    return <ErrorState>{queryErrorMessage(summary.error)}</ErrorState>;
  }

  const data = summary.data;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader
          kicker="Settings"
          title="Earnings"
          description="What you've earned from approved project allocations, and what's available to withdraw."
          action={<Button onClick={() => setWithdrawOpen(true)}>Withdraw funds</Button>}
        />
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatTile label="Available to withdraw" value={data.available} />
          <StatTile label="Pending" value={data.pending} helper="Requested but not yet paid" />
          <StatTile label="Lifetime earned" value={data.lifetimeEarned} />
          <StatTile label="Lifetime paid" value={data.lifetimePaid} />
        </dl>
      </Card>

      <Card>
        <CardHeader kicker="History" title="Recent earnings" />
        <EarningsQueryState
          isPending={recentEarnings.isPending}
          isError={recentEarnings.isError}
          error={recentEarnings.error}
          isEmpty={recentEarnings.isSuccess && recentEarnings.data.items.length === 0}
          emptyTitle="No earnings yet"
          emptyDescription="Approved project allocations will appear here."
        >
          <Table caption="Recent earnings">
            <TableHead>
              <TableHeaderCell>Project</TableHeaderCell>
              <TableHeaderCell>Date</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableHead>
            <TableBody>
              {recentEarnings.data?.items.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{entry.projectName}</TableCell>
                  <TableCell mono>{formatDate(entry.date)}</TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={entry.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EarningsQueryState>
      </Card>

      <Card>
        <CardHeader kicker="History" title="Payouts" />
        <EarningsQueryState
          isPending={payouts.isPending}
          isError={payouts.isError}
          error={payouts.error}
          isEmpty={payouts.isSuccess && payouts.data.items.length === 0}
          emptyTitle="No withdrawal requests yet"
          emptyDescription="Withdrawals you request will appear here."
        >
          <Table caption="Payouts">
            <TableHead>
              <TableHeaderCell>Requested</TableHeaderCell>
              <TableHeaderCell>Method</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableHead>
            <TableBody>
              {payouts.data?.items.map((payout) => (
                <TableRow key={payout.id}>
                  <TableCell mono>{formatDate(payout.requestedAt)}</TableCell>
                  <TableCell>{payout.payoutMethod.replaceAll("_", " ")}</TableCell>
                  <TableCell>
                    <StatusBadge tone={payoutTone[payout.status]}>{payout.status.replaceAll("_", " ")}</StatusBadge>
                  </TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={payout.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </EarningsQueryState>
      </Card>

      <Drawer open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Withdraw funds">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            const parsed = withdrawFundsFormSchema.safeParse({ amount });
            if (!parsed.success) {
              setAmountError(parsed.error.issues[0]?.message);
              return;
            }
            setAmountError(undefined);
            setPendingAmount(parsed.data.amount);
            setWithdrawOpen(false);
          }}
        >
          <p className="type-helper text-steel">
            Available to withdraw: <MoneyText value={data.available} />
          </p>
          <Field id="withdraw-amount" label="Amount" required error={amountError}>
            <Input
              id="withdraw-amount"
              name="amount"
              inputMode="decimal"
              placeholder="1500.00"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value);
                setAmountError(undefined);
              }}
              invalid={Boolean(amountError)}
            />
          </Field>
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setWithdrawOpen(false)}>
              Cancel
            </Button>
            <Button type="submit">Continue</Button>
          </div>
        </form>
      </Drawer>

      <ConfirmationDialog
        open={pendingAmount !== null}
        onClose={() => setPendingAmount(null)}
        onConfirm={() => pendingAmount && withdraw.mutate(pendingAmount)}
        title="Request this withdrawal?"
        description={
          pendingAmount
            ? `Forge will pay out ${formatInr(pendingAmount)} to your saved payout details once approved.`
            : ""
        }
        confirmLabel="Request withdrawal"
        pending={withdraw.isPending}
      />
    </div>
  );
}
