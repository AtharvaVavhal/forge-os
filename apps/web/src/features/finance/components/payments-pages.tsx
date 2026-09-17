"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import {
  createPayment,
  createRefund,
  getPayment,
  listInvoices,
  listPayments,
} from "../api/finance-api";
import { canRefundPayment } from "../api/lifecycle";
import { financeKeys } from "../api/query-keys";
import type { OfflinePaymentMethod, PaymentStatus } from "../api/types";
import { FinanceQueryState } from "./finance-query-state";
import { MoneyText } from "./money-text";
import { PaymentFields, RefundFields } from "./finance-forms";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";

const paymentTone: Record<PaymentStatus, StatusTone> = {
  PENDING: "pending",
  COMPLETED: "success",
  FAILED: "danger",
  REVERSED: "neutral",
};

export function PaymentsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();
  const { user } = useAuthorization();
  const filters = useMemo(() => ({ page, pageSize: 25, sort: "createdAt:desc" }), [page]);

  const list = useQuery({
    queryKey: financeKeys.payments.list(filters),
    queryFn: () => listPayments(filters),
  });
  const invoices = useQuery({
    queryKey: financeKeys.invoices.list({ page: 1, pageSize: 100 }),
    queryFn: () => listInvoices({ page: 1, pageSize: 100, sort: "createdAt:desc" }),
    enabled: createOpen,
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      invoiceId: string;
      amount: string;
      method: OfflinePaymentMethod;
      referenceNote?: string;
      paidAt?: string;
    }) => createPayment({ ...body, recordedBy: user.id }),
    onSuccess: (payment) => {
      queryClient.invalidateQueries({ queryKey: financeKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setCreateOpen(false);
      pushToast({ title: "Payment recorded", tone: "success" });
      router.push(`/finance/payments/${payment.id}`);
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t record payment", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Finance"
        title="Payments"
        description="Manual recording is offline methods only. Razorpay completion is webhook-authoritative."
        actions={
          <Can permission="finance.manage">
            <Button onClick={() => setCreateOpen(true)}>Record payment</Button>
          </Can>
        }
      />
      <FinanceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No payments"
        emptyDescription="Completed or failed payments will appear here. This is not ₹0 collected."
      >
        <Table caption="Payments">
          <TableHead>
            <TableHeaderCell>Invoice</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Method</TableHeaderCell>
            <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            <TableHeaderCell>Paid</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((payment) => (
              <TableRow key={payment.id}>
                <TableCell>
                  <Link href={`/finance/payments/${payment.id}`} className="font-semibold hover:underline">
                    {payment.invoice?.name ?? payment.invoiceId}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={paymentTone[payment.status]}>{enumLabel(payment.status)}</StatusBadge>
                </TableCell>
                <TableCell mono>{enumLabel(payment.method)}</TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={payment.amount} />
                </TableCell>
                <TableCell mono>{formatTimestamp(payment.paidAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} payments` : undefined} />
      </FinanceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Record offline payment">
        <PaymentFields
          invoices={invoices.data?.items ?? []}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
    </div>
  );
}

export function PaymentDetailPage({ id }: { id: string }) {
  const [refundOpen, setRefundOpen] = useState(false);
  const [confirmRefund, setConfirmRefund] = useState<{ amount: string; reason: string } | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const query = useQuery({
    queryKey: financeKeys.payments.detail(id),
    queryFn: () => getPayment(id),
  });

  const refundMutation = useMutation({
    mutationFn: (body: { amount: string; reason: string }) => createRefund({ paymentId: id, ...body }),
    onSuccess: (refund) => {
      queryClient.invalidateQueries({ queryKey: financeKeys.payments.detail(id) });
      queryClient.invalidateQueries({ queryKey: financeKeys.payments.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setRefundOpen(false);
      setConfirmRefund(null);
      pushToast({
        title: "Refund submitted",
        description: `Status ${enumLabel(refund.status)}. The payment is not marked reversed until the backend says so.`,
        tone: "success",
      });
    },
    onError: (error) => pushToast({ title: "Refund failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading payment" />;
  if (query.isError && isUnauthorizedError(query.error)) {
    return <ErrorState title="Session expired">{queryErrorMessage(query.error)}</ErrorState>;
  }
  if (query.isError && isForbiddenError(query.error)) {
    return <ForbiddenState />;
  }
  if (query.isError && isNotFoundError(query.error)) {
    return (
      <ErrorState title="Finance service is not currently available.">
        GET /payments/:id returned 404. This is not a completed ₹0 payment.
      </ErrorState>
    );
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const payment = query.data;

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-steel/15 pb-6">
        <p className="type-mono-label text-steel">Payment</p>
        <h1 className="type-page-title text-ink">
          <MoneyText value={payment.amount} />
        </h1>
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge tone={paymentTone[payment.status]}>{enumLabel(payment.status)}</StatusBadge>
          <p className="type-metadata text-steel">{enumLabel(payment.method)}</p>
        </div>
      </header>

      <Can permission="finance.manage">
        {canRefundPayment(payment.status) ? (
          <Button variant="secondary" onClick={() => setRefundOpen(true)}>
            Refund
          </Button>
        ) : null}
      </Can>

      <Panel title="Record">
        <FactList
          items={[
            {
              label: "Invoice",
              value: (
                <Link className="hover:underline" href={`/finance/invoices/${payment.invoiceId}`}>
                  {payment.invoice?.name ?? payment.invoiceId}
                </Link>
              ),
            },
            { label: "Paid at", value: formatTimestamp(payment.paidAt) },
            { label: "Reference", value: payment.referenceNote ?? "—" },
            { label: "Recorded by", value: payment.recordedBy ?? "—" },
            { label: "Razorpay payment", value: payment.razorpayPaymentId ?? "—" },
            { label: "Razorpay order", value: payment.razorpayOrderId ?? "—" },
          ]}
        />
        {payment.method !== "RAZORPAY" && payment.recordedBy ? (
          <p className="type-helper mt-3 text-steel">Recorded manually by {payment.recordedBy}.</p>
        ) : null}
      </Panel>

      <Panel title="Refunds">
        {payment.refunds.length === 0 ? (
          <p className="type-helper text-steel">
            No refunds nested on this payment. GET /refunds has no documented paymentId filter.
          </p>
        ) : (
          <Table caption="Refunds">
            <TableHead>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableHead>
            <TableBody>
              {payment.refunds.map((refund) => (
                <TableRow key={refund.id}>
                  <TableCell>{enumLabel(refund.status)}</TableCell>
                  <TableCell>{refund.reason}</TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={refund.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Drawer open={refundOpen} onClose={() => setRefundOpen(false)} title="Refund">
        <RefundFields
          pending={false}
          onCancel={() => setRefundOpen(false)}
          onSubmit={(values) => {
            setConfirmRefund(values);
            setRefundOpen(false);
          }}
        />
      </Drawer>
      <ConfirmationDialog
        open={confirmRefund !== null}
        onClose={() => setConfirmRefund(null)}
        onConfirm={() => confirmRefund && refundMutation.mutate(confirmRefund)}
        title="Submit this refund?"
        description="The payment stays in its current status until the backend confirms a reversal."
        confirmLabel="Submit refund"
        destructive
        pending={refundMutation.isPending}
      />
    </div>
  );
}
