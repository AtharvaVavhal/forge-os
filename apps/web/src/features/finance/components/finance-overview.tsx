"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/ui/panel";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { ForbiddenAlert } from "@/features/auth/components/forbidden-alert";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, isNetworkError, queryErrorMessage } from "@/lib/api/query-error";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { getForgeFundBalance, listExpenses, listInvoices, listPayments } from "../api/finance-api";
import { financeKeys } from "../api/query-keys";
import { MoneyText } from "./money-text";

function Metric({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  href: string;
}) {
  return (
    <div className="border-t border-steel/15 pt-3">
      <p className="type-mono-label text-steel">{label}</p>
      <p className="mt-2 type-subsection text-ink">{value}</p>
      <p className="type-helper mt-1 text-steel">{hint}</p>
      <Link href={href} className="type-body mt-2 inline-block font-semibold hover:underline">
        Open
      </Link>
    </div>
  );
}

export function FinanceOverviewPage() {
  const invoices = useQuery({
    queryKey: financeKeys.invoices.list({ page: 1, pageSize: 1 }),
    queryFn: () => listInvoices({ page: 1, pageSize: 1, sort: "createdAt:desc" }),
  });
  const payments = useQuery({
    queryKey: financeKeys.payments.list({ page: 1, pageSize: 1 }),
    queryFn: () => listPayments({ page: 1, pageSize: 1, sort: "createdAt:desc" }),
  });
  const expenses = useQuery({
    queryKey: financeKeys.expenses.list({ page: 1, pageSize: 1 }),
    queryFn: () => listExpenses({ page: 1, pageSize: 1, sort: "createdAt:desc" }),
  });
  const balance = useQuery({
    queryKey: financeKeys.forgeFund.balance,
    queryFn: getForgeFundBalance,
  });

  const loading = invoices.isPending && payments.isPending && expenses.isPending && balance.isPending;
  const financeDown =
    (invoices.isError && isNotFoundError(invoices.error)) ||
    (payments.isError && isNotFoundError(payments.error)) ||
    (balance.isError && isNotFoundError(balance.error));
  const forbidden =
    (invoices.isError && isForbiddenError(invoices.error)) ||
    (payments.isError && isForbiddenError(payments.error)) ||
    (expenses.isError && isForbiddenError(expenses.error));
  const expired =
    (invoices.isError && isUnauthorizedError(invoices.error)) ||
    (payments.isError && isUnauthorizedError(payments.error)) ||
    (balance.isError && isUnauthorizedError(balance.error));
  const network =
    (invoices.isError && isNetworkError(invoices.error)) ||
    (payments.isError && isNetworkError(payments.error)) ||
    (expenses.isError && isNetworkError(expenses.error)) ||
    (balance.isError && isNetworkError(balance.error));

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Finance"
        title="Overview"
        description="Only documented endpoints are queried. Totals are never summed from a page of rows."
      />

      {loading ? <LoadingState label="Loading finance overview" /> : null}

      {expired ? (
        <ErrorState title="Session expired">{queryErrorMessage(invoices.error ?? payments.error ?? balance.error)}</ErrorState>
      ) : null}

      {forbidden ? <ForbiddenAlert /> : null}

      {financeDown ? (
        <ErrorState title="Finance service is not currently available.">
          Invoice, payment, or Forge Fund routes returned 404. No ₹0 figures are shown.
        </ErrorState>
      ) : null}

      {network && !financeDown && !expired && !forbidden ? (
        <ErrorState>{queryErrorMessage(invoices.error ?? payments.error ?? expenses.error ?? balance.error)}</ErrorState>
      ) : null}

      {loading || expired || forbidden ? null : (
        <>
      <Panel title="Position">
        <div className="grid gap-6 sm:grid-cols-2">
          <Metric
            label="Outstanding invoices"
            value="—"
            hint="Awaiting live data. No outstanding-invoices aggregate is documented."
            href="/finance/invoices"
          />
          <Metric
            label="Collected payments"
            value="—"
            hint="Awaiting live data. No collected-payments aggregate is documented."
            href="/finance/payments"
          />
          <Metric
            label="Expenses"
            value="—"
            hint="Awaiting live data. Expense totals are not an API field."
            href="/finance/expenses"
          />
          <div className="border-t border-steel/15 pt-3">
            <p className="type-mono-label text-steel">Forge Fund balance</p>
            {balance.isPending ? (
              <LoadingState label="Loading balance" />
            ) : balance.isError ? (
              isNotFoundError(balance.error) || isNetworkError(balance.error) ? (
                <p className="mt-2 type-subsection text-ink">—</p>
              ) : (
                <ErrorState>{queryErrorMessage(balance.error)}</ErrorState>
              )
            ) : (
              <p className="mt-2 type-subsection text-ink">
                {balance.data ? <MoneyText value={balance.data} /> : "—"}
              </p>
            )}
            <p className="type-helper mt-1 text-steel">GET /forge-fund/balance. Never derived from the ledger page.</p>
            <Link href="/finance/forge-fund" className="type-body mt-2 inline-block font-semibold hover:underline">
              Open
            </Link>
          </div>
        </div>
      </Panel>

      <Panel title="Record counts">
        <p className="type-helper mb-4 text-steel">
          Counts use list `meta.pagination.total` when the API sends it. They are not money.
        </p>
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="type-mono-label text-steel">Invoices</dt>
            <dd className="mt-1 tabular-nums">{invoices.data?.total ?? "—"}</dd>
          </div>
          <div>
            <dt className="type-mono-label text-steel">Payments</dt>
            <dd className="mt-1 tabular-nums">{payments.data?.total ?? "—"}</dd>
          </div>
          <div>
            <dt className="type-mono-label text-steel">Expenses</dt>
            <dd className="mt-1 tabular-nums">{expenses.data?.total ?? "—"}</dd>
          </div>
        </dl>
      </Panel>
        </>
      )}
    </div>
  );
}
