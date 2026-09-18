"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Breadcrumb } from "@/components/data-display/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/overlays/toast";
import { queryErrorMessage } from "@/lib/api/query-error";
import { getPortalInvoice, payPortalInvoice } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import { openRazorpayCheckout } from "../lib/razorpay-checkout";
import type { PortalInvoiceStatus } from "../types";
import { MoneyText } from "./money-text";

const PAYABLE_STATUSES = new Set<PortalInvoiceStatus>(["SENT", "PARTIALLY_PAID", "OVERDUE"]);

/** Bounded webhook wait — checkout success ≠ paid; stop once PAID or timeout. */
const PAYMENT_POLL_INTERVAL_MS = 2000;
const PAYMENT_POLL_MAX_MS = 30_000;

function outstandingAmount(invoice: {
  pendingAmount: string | null;
  amount: string | null;
  paidAmount: string | null;
}): number {
  if (invoice.pendingAmount) {
    const pending = Number.parseFloat(invoice.pendingAmount);
    if (Number.isFinite(pending)) return pending;
  }
  const total = Number.parseFloat(invoice.amount ?? "0");
  const paid = Number.parseFloat(invoice.paidAmount ?? "0");
  if (!Number.isFinite(total) || !Number.isFinite(paid)) return 0;
  return Math.max(0, total - paid);
}

export function PortalInvoiceDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [payMessage, setPayMessage] = useState<{ tone: "success" | "danger" | "info"; text: string } | null>(
    null
  );
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [awaitingPaymentConfirm, setAwaitingPaymentConfirm] = useState(false);

  const { data: invoice, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.invoices.detail(id),
    queryFn: () => getPortalInvoice(id),
    refetchInterval: (query) => {
      if (!awaitingPaymentConfirm) return false;
      if (query.state.data?.status === "PAID") return false;
      return PAYMENT_POLL_INTERVAL_MS;
    },
  });

  // Adjust local polling flag from authoritative invoice status (not an effect).
  if (awaitingPaymentConfirm && invoice?.status === "PAID") {
    setAwaitingPaymentConfirm(false);
    setPayMessage({
      tone: "success",
      text: "Payment confirmed. This invoice is now marked paid.",
    });
  }

  useEffect(() => {
    if (!awaitingPaymentConfirm) return;
    const timer = window.setTimeout(() => {
      setAwaitingPaymentConfirm(false);
      setPayMessage({
        tone: "info",
        text: "Payment is still processing. Status updates when the gateway webhook confirms — refresh this page shortly.",
      });
    }, PAYMENT_POLL_MAX_MS);
    return () => window.clearTimeout(timer);
  }, [awaitingPaymentConfirm]);

  const payMutation = useMutation({
    mutationFn: () => payPortalInvoice(id),
    onSuccess: async (order) => {
      setCheckoutOpen(true);
      setPayMessage({
        tone: "info",
        text: "Opening secure checkout. Payment completion is confirmed after the gateway notifies FORGE.",
      });
      await openRazorpayCheckout(order, {
        description: invoice?.invoiceNumber
          ? `Invoice ${invoice.invoiceNumber}`
          : "Invoice payment",
        onSuccess: () => {
          setCheckoutOpen(false);
          setAwaitingPaymentConfirm(true);
          setPayMessage({
            tone: "info",
            text: "Payment submitted. Waiting for gateway confirmation…",
          });
          pushToast({ title: "Payment submitted", tone: "success" });
          void queryClient.invalidateQueries({ queryKey: portalKeys.invoices.detail(id) });
          void queryClient.invalidateQueries({ queryKey: portalKeys.invoices.all });
        },
        onDismiss: () => {
          setCheckoutOpen(false);
          setPayMessage({
            tone: "info",
            text: "Checkout closed. You can try again when ready.",
          });
        },
        onFailure: (reason) => {
          setCheckoutOpen(false);
          setPayMessage({ tone: "danger", text: reason });
          pushToast({ title: "Payment failed", description: reason, tone: "danger" });
        },
      });
    },
    onError: (err) => {
      setCheckoutOpen(false);
      const message = queryErrorMessage(err);
      setPayMessage({ tone: "danger", text: message });
      pushToast({ title: "Could not start payment", description: message, tone: "danger" });
    },
  });

  const outstanding = invoice ? outstandingAmount(invoice) : 0;
  const canPay =
    Boolean(invoice) &&
    PAYABLE_STATUSES.has(invoice!.status) &&
    outstanding > 0;
  const alreadyPaid = invoice?.status === "PAID" || (invoice != null && outstanding <= 0);
  const payBusy = payMutation.isPending || checkoutOpen || awaitingPaymentConfirm;

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="portal-invoice-detail-page">
      <Breadcrumb
        items={[
          { label: "Invoices", href: "/portal/invoices" },
          { label: invoice?.invoiceNumber || "Invoice Detail" },
        ]}
      />

      {isLoading && (
        <Card className="p-8 space-y-4 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-invoice-loading">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-48 w-full" />
        </Card>
      )}

      {isError && (
        <div data-testid="portal-invoice-error">
          <Alert tone="danger" title="Unavailable">
            {queryErrorMessage(error)}
          </Alert>
        </div>
      )}

      {invoice && (
        <div className="space-y-6">
          <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)] font-mono">
                    {invoice.invoiceNumber || "Invoice"}
                  </h1>
                  <PortalStatusBadge status={invoice.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--forge-ink-muted,#78736a)] mt-2">
                  {invoice.financialYear && <span>FY: {invoice.financialYear}</span>}
                  {invoice.sentAt && (
                    <span>Issued: {new Date(invoice.sentAt).toLocaleDateString()}</span>
                  )}
                  {invoice.dueDate && (
                    <span>Due: {new Date(invoice.dueDate).toLocaleDateString()}</span>
                  )}
                  {invoice.taxTreatment && (
                    <span>Tax Treatment: {invoice.taxTreatment}</span>
                  )}
                </div>
              </div>

              <div className="flex flex-col items-stretch sm:items-end gap-2" data-testid="portal-invoice-pay-panel">
                {alreadyPaid ? (
                  <p className="text-sm text-emerald-700 font-medium" data-testid="portal-invoice-paid">
                    This invoice is fully paid.
                  </p>
                ) : canPay ? (
                  <>
                    <p className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                      Outstanding:{" "}
                      <span className="font-semibold text-[var(--forge-ink,#1a1918)]">
                        <MoneyText value={invoice.pendingAmount ?? String(outstanding.toFixed(2))} />
                      </span>
                    </p>
                    <Button
                      onClick={() => {
                        setPayMessage(null);
                        payMutation.mutate();
                      }}
                      loading={payBusy}
                      disabled={payBusy}
                      data-testid="portal-invoice-pay-button"
                    >
                      {awaitingPaymentConfirm ? "Confirming payment…" : "Pay now"}
                    </Button>
                  </>
                ) : (
                  <p className="text-sm text-[var(--forge-ink-muted,#78736a)]" data-testid="portal-invoice-not-payable">
                    This invoice cannot be paid online in its current status.
                  </p>
                )}
              </div>
            </div>

            {payMessage ? (
              <div data-testid={awaitingPaymentConfirm ? "portal-invoice-payment-processing" : undefined}>
                <Alert
                  tone={payMessage.tone}
                  title={
                    payMessage.tone === "danger"
                      ? "Payment"
                      : awaitingPaymentConfirm
                        ? "Payment processing"
                        : "Checkout"
                  }
                >
                  {payMessage.text}
                </Alert>
              </div>
            ) : null}
          </Card>

          {invoice.billTo && (
            <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--forge-ink-muted,#78736a)]">
                Billed To
              </h2>
              <div className="text-sm text-[var(--forge-ink,#1a1918)] space-y-0.5">
                {invoice.billTo.name && <div className="font-medium">{invoice.billTo.name}</div>}
                {invoice.billTo.gstin && (
                  <div className="text-xs font-mono text-[var(--forge-ink-muted,#78736a)]">
                    GSTIN: {invoice.billTo.gstin}
                  </div>
                )}
                {invoice.billTo.billingAddress && (
                  <div className="text-xs text-[var(--forge-ink-muted,#78736a)] whitespace-pre-wrap">
                    {invoice.billTo.billingAddress}
                  </div>
                )}
                {invoice.billTo.billingState && (
                  <div className="text-xs text-[var(--forge-ink-muted,#78736a)]">
                    State: {invoice.billTo.billingState}
                  </div>
                )}
              </div>
            </Card>
          )}

          <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
            <h2 className="text-base font-semibold text-[var(--forge-ink,#1a1918)]">
              Invoice Items
            </h2>

            {invoice.lineItems.length === 0 ? (
              <p className="text-sm text-[var(--forge-ink-muted,#78736a)] py-4 text-center">
                No line items specified.
              </p>
            ) : (
              <Table caption="Invoice line items">
                <TableHead>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell>HSN/SAC</TableHeaderCell>
                  <TableHeaderCell className="text-right">Qty</TableHeaderCell>
                  <TableHeaderCell className="text-right">Rate</TableHeaderCell>
                  <TableHeaderCell className="text-right">Line Total</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {invoice.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-sm">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-[var(--forge-ink-muted,#78736a)]">
                        {item.hsnSacCode || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {item.quantity ?? "1"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <MoneyText value={item.unitPrice} />
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium">
                        <MoneyText value={item.lineTotal} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>

          <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)]">
            <div className="max-w-xs ml-auto space-y-2 text-sm">
              <div className="flex justify-between py-1 border-b border-[var(--forge-border-subtle,#f0eae0)]">
                <span className="text-[var(--forge-ink-muted,#78736a)]">Total Amount</span>
                <span className="font-semibold text-[var(--forge-ink,#1a1918)]">
                  <MoneyText value={invoice.amount} />
                </span>
              </div>
              <div className="flex justify-between py-1 border-b border-[var(--forge-border-subtle,#f0eae0)]">
                <span className="text-[var(--forge-ink-muted,#78736a)]">Paid Amount</span>
                <span className="text-emerald-700 font-medium">
                  <MoneyText value={invoice.paidAmount} fallback="₹0.00" />
                </span>
              </div>
              <div className="flex justify-between py-1.5 text-base font-bold">
                <span>Balance Due</span>
                <span>
                  <MoneyText value={invoice.pendingAmount} fallback="₹0.00" />
                </span>
              </div>
            </div>
          </Card>

          {invoice.payments.length > 0 && (
            <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
              <h2 className="text-base font-semibold text-[var(--forge-ink,#1a1918)]">
                Recorded Payments
              </h2>
              <Table caption="Recorded payments">
                <TableHead>
                  <TableHeaderCell>Date</TableHeaderCell>
                  <TableHeaderCell>Method</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Gateway reference</TableHeaderCell>
                  <TableHeaderCell className="text-right">Amount</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {invoice.payments.map((pmt) => (
                    <TableRow key={pmt.id}>
                      <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                        {pmt.paidAt ? new Date(pmt.paidAt).toLocaleDateString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono">
                        {pmt.method}
                      </TableCell>
                      <TableCell>
                        <PortalStatusBadge status={pmt.status} />
                      </TableCell>
                      <TableCell className="text-xs font-mono text-[var(--forge-ink-muted,#78736a)]">
                        {pmt.razorpayPaymentId || "—"}
                      </TableCell>
                      <TableCell className="text-right text-sm font-medium text-emerald-700">
                        <MoneyText value={pmt.amount} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
