"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPortalInvoices } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import { queryErrorMessage } from "@/lib/api/query-error";
import { MoneyText } from "./money-text";

export function PortalInvoicesPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.invoices.list(),
    queryFn: () => listPortalInvoices(),
  });

  return (
    <div className="space-y-6" data-testid="portal-invoices-page">
      <div className="border-b border-[var(--forge-border,#e5dfd5)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
          Invoices
        </h1>
        <p className="text-sm text-[var(--forge-ink-muted,#78736a)] mt-1">
          Review invoices, tax breakdowns, and payment records for your company.
        </p>
      </div>

      {isLoading && (
        <Card className="p-6 space-y-3 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-invoices-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Card>
      )}

      {isError && (
        <div data-testid="portal-invoices-error">
          <Alert tone="danger" title="Service Unavailable">
            {queryErrorMessage(error)}
          </Alert>
        </div>
      )}

      {data && data.items.length === 0 && (
        <Card className="p-12 text-center bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-invoices-empty">
          <p className="text-sm text-[var(--forge-ink-muted,#78736a)]">
            No invoices found for your company.
          </p>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden bg-white border-[var(--forge-border,#e5dfd5)]">
          <Table caption="Invoices">
            <TableHead>
              <TableHeaderCell>Invoice Number</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Due Date</TableHeaderCell>
              <TableHeaderCell className="text-right">Total Amount</TableHeaderCell>
              <TableHeaderCell className="text-right">Balance Due</TableHeaderCell>
              <TableHeaderCell className="text-right">Action</TableHeaderCell>
            </TableHead>
            <TableBody>
              {data.items.map((invoice) => (
                <TableRow key={invoice.id} data-testid={`portal-invoice-row-${invoice.id}`}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className="text-[var(--forge-ink,#1a1918)] hover:underline font-mono text-sm font-semibold"
                    >
                      {invoice.invoiceNumber || "Invoice"}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PortalStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                    {invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    <MoneyText value={invoice.amount} />
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    <MoneyText value={invoice.pendingAmount} fallback="—" />
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
                    >
                      View &rarr;
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
