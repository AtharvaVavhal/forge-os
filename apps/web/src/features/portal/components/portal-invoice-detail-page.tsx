"use client";

import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Breadcrumb } from "@/components/data-display/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPortalInvoice } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import { MoneyText } from "./money-text";

export function PortalInvoiceDetailPage({ id }: { id: string }) {
  const { data: invoice, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.invoices.detail(id),
    queryFn: () => getPortalInvoice(id),
  });

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
        <Alert variant="danger" title="Unavailable" data-testid="portal-invoice-error">
          {(error as Error)?.message || "Invoice could not be loaded."}
        </Alert>
      )}

      {invoice && (
        <div className="space-y-6">
          {/* Header Card */}
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
            </div>
          </Card>

          {/* Bill-To Information */}
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

          {/* Line Items Table */}
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

          {/* Authoritative Financial Totals */}
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

          {/* Recorded Payments */}
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
                  <TableHeaderCell>Reference / Razorpay ID</TableHeaderCell>
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
