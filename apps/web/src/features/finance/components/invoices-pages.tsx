"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pagination } from "@/components/data-display/pagination";
import { Tabs, TabPanel } from "@/components/data-display/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  TableRowActions,
} from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/icons";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog, Modal } from "@/components/overlays/modal";
import { Panel } from "@/components/ui/panel";
import { Field } from "@/components/forms/field";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { listCompanies } from "@/features/crm/api/crm-api";
import { crmKeys } from "@/features/crm/api/query-keys";
import { listProposals } from "@/features/sales/api/sales-api";
import { salesKeys } from "@/features/sales/api/query-keys";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel, formatDate, formatTimestamp } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import {
  cancelInvoice,
  createCreditNote,
  createInvoice,
  createInvoiceFromProposal,
  getInvoice,
  listInvoices,
  remindInvoice,
  replaceInvoiceLineItems,
  sendInvoice,
  updateInvoice,
  voidInvoice,
} from "../api/finance-api";
import {
  canCancelInvoice,
  canRemindInvoice,
  canSendInvoice,
  canVoidInvoice,
  isDraftInvoice,
} from "../api/lifecycle";
import { financeKeys } from "../api/query-keys";
import { cancelInvoiceSchema } from "../schemas/finance-forms";
import type { CreditNoteReason, InvoiceStatus } from "../api/types";
import { FinanceQueryState } from "./finance-query-state";
import { MoneyText } from "./money-text";
import {
  CreditNoteFields,
  InvoiceDueDateFields,
  InvoiceFields,
  InvoiceFromProposalFields,
  InvoiceLineEditor,
} from "./finance-forms";
import { DocumentsPanel } from "@/features/shared/components/documents-panel";

const invoiceTone: Record<InvoiceStatus, StatusTone> = {
  DRAFT: "pending",
  SENT: "neutral",
  PARTIALLY_PAID: "info",
  PAID: "success",
  OVERDUE: "danger",
  VOID: "neutral",
  CANCELLED: "neutral",
};

export function InvoicesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [fromProposalOpen, setFromProposalOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();
  const filters = useMemo(() => ({ page, pageSize: 25, sort: "createdAt:desc" }), [page]);

  const list = useQuery({
    queryKey: financeKeys.invoices.list(filters),
    queryFn: () => listInvoices(filters),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100 }),
    enabled: createOpen,
  });
  const proposals = useQuery({
    queryKey: salesKeys.proposals.list({ page: 1, pageSize: 100 }),
    queryFn: () => listProposals({ page: 1, pageSize: 100, sort: "createdAt:desc" }),
    enabled: fromProposalOpen,
  });

  const createMutation = useMutation({
    mutationFn: createInvoice,
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setCreateOpen(false);
      pushToast({ title: "Draft invoice created", tone: "success" });
      router.push(`/finance/invoices/${invoice.id}`);
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t create invoice", description: queryErrorMessage(error), tone: "danger" }),
  });

  const fromProposalMutation = useMutation({
    mutationFn: createInvoiceFromProposal,
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setFromProposalOpen(false);
      pushToast({ title: "Invoice created from proposal snapshot", tone: "success" });
      router.push(`/finance/invoices/${invoice.id}`);
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t create from proposal", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Finance"
        title="Invoices"
        description="Amounts are backend snapshots. Filters beyond page/sort are not documented on GET /invoices."
        actions={
          <Can permission="finance.manage">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setFromProposalOpen(true)}>
                From proposal
              </Button>
              <Button onClick={() => setCreateOpen(true)}>New draft</Button>
            </div>
          </Can>
        }
      />
      <FinanceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No invoices"
        emptyDescription="Drafts appear here after create. This is not a zero rupee balance."
      >
        <Table caption="Invoices">
          <TableHead>
            <TableHeaderCell>Number</TableHeaderCell>
            <TableHeaderCell>Client</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Sent</TableHeaderCell>
            <TableHeaderCell>Due</TableHeaderCell>
            <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            <TableHeaderCell className="text-right">Paid</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((invoice) => (
              <TableRow key={invoice.id}>
                <TableCell>
                  <Link href={`/finance/invoices/${invoice.id}`} className="font-semibold hover:underline">
                    {invoice.invoiceNumber ?? "Draft"}
                  </Link>
                </TableCell>
                <TableCell>{invoice.company?.name ?? invoice.companyId}</TableCell>
                <TableCell>
                  <StatusBadge tone={invoiceTone[invoice.status]}>{enumLabel(invoice.status)}</StatusBadge>
                </TableCell>
                <TableCell mono>{formatDate(invoice.sentAt)}</TableCell>
                <TableCell mono>{formatDate(invoice.dueDate)}</TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={invoice.amount} />
                </TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={invoice.paidAmount} />
                </TableCell>
                <TableRowActions>
                  <Dropdown
                    trigger={({ open, setOpen, triggerId, menuId }) => (
                      <IconButton
                        id={triggerId}
                        label={`Actions for ${invoice.invoiceNumber ?? "draft invoice"}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen(!open)}
                      >
                        <IconMore size={16} />
                      </IconButton>
                    )}
                  >
                    <DropdownItem onSelect={() => router.push(`/finance/invoices/${invoice.id}`)}>Open</DropdownItem>
                  </Dropdown>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} invoices` : undefined} />
      </FinanceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New draft invoice">
        <InvoiceFields
          companies={companies.data?.items ?? []}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
      <Drawer open={fromProposalOpen} onClose={() => setFromProposalOpen(false)} title="Invoice from proposal">
        <InvoiceFromProposalFields
          proposals={proposals.data?.items ?? []}
          pending={fromProposalMutation.isPending}
          onCancel={() => setFromProposalOpen(false)}
          onSubmit={(proposalId) => fromProposalMutation.mutate(proposalId)}
        />
      </Drawer>
    </div>
  );
}

export function InvoiceDetailPage({ id }: { id: string }) {
  const [tab, setTab] = useState("lines");
  const [editOpen, setEditOpen] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);
  const [confirm, setConfirm] = useState<"SEND" | "VOID" | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | undefined>();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const query = useQuery({
    queryKey: financeKeys.invoices.detail(id),
    queryFn: () => getInvoice(id),
  });

  const updateMutation = useMutation({
    mutationFn: (body: { dueDate?: string }) => updateInvoice(id, { ...body, version: query.data?.version ?? 1 }),
    onSuccess: (invoice) => {
      queryClient.setQueryData(financeKeys.invoices.detail(id), invoice);
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setEditOpen(false);
      pushToast({ title: "Draft saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const linesMutation = useMutation({
    mutationFn: (
      lines: Array<{
        description: string;
        quantity: string;
        unitPrice: string;
        hsnSacCode: string;
        sortOrder: number;
      }>
    ) => replaceInvoiceLineItems(id, lines),
    onSuccess: (invoice) => {
      queryClient.setQueryData(financeKeys.invoices.detail(id), invoice);
      setLinesOpen(false);
      pushToast({ title: "Line items replaced", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t update lines", description: queryErrorMessage(error), tone: "danger" }),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendInvoice(id),
    onSuccess: (invoice) => {
      queryClient.setQueryData(financeKeys.invoices.detail(id), invoice);
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setConfirm(null);
      pushToast({ title: "Invoice sent", description: invoice.invoiceNumber ?? undefined, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Send failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const voidMutation = useMutation({
    mutationFn: () => voidInvoice(id),
    onSuccess: (invoice) => {
      queryClient.setQueryData(financeKeys.invoices.detail(id), invoice);
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      setConfirm(null);
      pushToast({ title: "Invoice voided", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Void failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason: string) => cancelInvoice(id, reason),
    onSuccess: (invoice) => {
      queryClient.setQueryData(financeKeys.invoices.detail(id), invoice);
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.all });
      queryClient.invalidateQueries({ queryKey: financeKeys.creditNotes.all });
      setCancelOpen(false);
      setCancelReason("");
      setCancelError(undefined);
      pushToast({ title: "Invoice cancelled", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Cancel failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const remindMutation = useMutation({
    mutationFn: () => remindInvoice(id),
    onSuccess: () => pushToast({ title: "Reminder queued", tone: "success" }),
    onError: (error) => pushToast({ title: "Remind failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const creditMutation = useMutation({
    mutationFn: (body: { invoiceId: string; reason: CreditNoteReason; amount: string }) => createCreditNote(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.invoices.detail(id) });
      queryClient.invalidateQueries({ queryKey: financeKeys.creditNotes.all });
      setCreditOpen(false);
      pushToast({ title: "Credit note issued", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t issue credit note", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading invoice" />;
  if (query.isError && isUnauthorizedError(query.error)) {
    return <ErrorState title="Session expired">{queryErrorMessage(query.error)}</ErrorState>;
  }
  if (query.isError && isForbiddenError(query.error)) {
    return <ForbiddenState />;
  }
  if (query.isError && isNotFoundError(query.error)) {
    return (
      <ErrorState title="Finance service is not currently available.">
        GET /invoices/:id returned 404. This is not a ₹0 invoice.
      </ErrorState>
    );
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const invoice = query.data;
  const draft = isDraftInvoice(invoice.status);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 border-b border-steel/15 pb-6">
        <p className="type-mono-label text-steel">Invoice</p>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <h1 className="type-page-title text-ink">{invoice.invoiceNumber ?? "Draft invoice"}</h1>
          <Can permission="finance.manage">
            {draft ? (
              <Button variant="secondary" onClick={() => setEditOpen(true)}>
                Edit draft
              </Button>
            ) : null}
          </Can>
        </div>
        <StatusBadge tone={invoiceTone[invoice.status]}>{enumLabel(invoice.status)}</StatusBadge>
      </header>

      <Can permission="finance.manage">
        <div className="flex flex-wrap gap-2">
          {canSendInvoice(invoice.status) ? (
            <Button onClick={() => setConfirm("SEND")} loading={sendMutation.isPending}>
              Send
            </Button>
          ) : null}
          {draft ? (
            <Button variant="secondary" onClick={() => setLinesOpen(true)}>
              Replace line items
            </Button>
          ) : null}
          {canRemindInvoice(invoice.status) ? (
            <Button variant="secondary" onClick={() => remindMutation.mutate()} loading={remindMutation.isPending}>
              Send reminder
            </Button>
          ) : null}
          {canVoidInvoice(invoice.status) ? (
            <Button variant="destructive" onClick={() => setConfirm("VOID")}>
              Void
            </Button>
          ) : null}
          {canCancelInvoice(invoice.status) ? (
            <Button variant="destructive" onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          ) : null}
        </div>
      </Can>

      <Panel title="Client">
        <FactList
          items={[
            {
              label: "Company",
              value: invoice.company ? (
                <Link className="hover:underline" href={`/crm/companies/${invoice.company.id}`}>
                  {invoice.company.name}
                </Link>
              ) : (
                invoice.companyId
              ),
            },
            { label: "GSTIN", value: invoice.billTo?.gstin ?? "—" },
            { label: "Bill-to name", value: invoice.billTo?.name ?? "—" },
            { label: "Billing state", value: invoice.billTo?.billingState ?? "—" },
            { label: "Billing address", value: invoice.billTo?.billingAddress ?? "—" },
            { label: "Tax treatment", value: invoice.taxTreatment ? enumLabel(invoice.taxTreatment) : "—" },
            { label: "Financial year", value: invoice.financialYear ?? "—" },
            { label: "Created", value: formatTimestamp(invoice.createdAt) },
            { label: "Sent", value: formatTimestamp(invoice.sentAt) },
            { label: "Due", value: formatDate(invoice.dueDate) },
            { label: "Cancellation reason", value: invoice.cancellationReason ?? "—" },
          ]}
        />
      </Panel>

      <dl className="grid gap-4 border-y border-steel/15 py-4 sm:grid-cols-3">
        <div>
          <dt className="type-mono-label text-steel">Subtotal</dt>
          <dd className="mt-1 type-body text-steel">—</dd>
          <p className="type-helper mt-1 text-steel">Not stored on Invoice.</p>
        </div>
        <div>
          <dt className="type-mono-label text-steel">Tax</dt>
          <dd className="mt-1 type-body text-steel">—</dd>
          <p className="type-helper mt-1 text-steel">Rates live on line snapshots. No invoice tax total field.</p>
        </div>
        <div>
          <dt className="type-mono-label text-steel">Total</dt>
          <dd className="type-subsection mt-1 text-ink">
            <MoneyText value={invoice.amount} />
          </dd>
        </div>
        <div>
          <dt className="type-mono-label text-steel">Paid</dt>
          <dd className="mt-1">
            <MoneyText value={invoice.paidAmount} />
          </dd>
        </div>
        <div>
          <dt className="type-mono-label text-steel">Outstanding</dt>
          <dd className="mt-1">
            <MoneyText value={invoice.pendingAmount} fallback="—" />
          </dd>
          {!invoice.pendingAmount ? (
            <p className="type-helper mt-1 text-steel">
              `pending_amount` is computed, not stored. Displayed only when the API returns it.
            </p>
          ) : null}
        </div>
      </dl>

      <Tabs
        tabs={[
          { id: "lines", label: "Line items" },
          { id: "payments", label: "Payments" },
          { id: "credits", label: "Credit notes" },
          { id: "documents", label: "Documents" },
        ]}
        value={tab}
        onChange={setTab}
      />

      <TabPanel id="lines" active={tab === "lines"}>
        {invoice.lineItems.length === 0 ? (
          <p className="type-helper text-steel">No line items on this invoice.</p>
        ) : (
          <Table caption="Invoice line items">
            <TableHead>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>HSN/SAC</TableHeaderCell>
              <TableHeaderCell className="text-right">Qty</TableHeaderCell>
              <TableHeaderCell className="text-right">Rate</TableHeaderCell>
              <TableHeaderCell className="text-right">CGST</TableHeaderCell>
              <TableHeaderCell className="text-right">SGST</TableHeaderCell>
              <TableHeaderCell className="text-right">IGST</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableHead>
            <TableBody>
              {invoice.lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell mono>{item.hsnSacCode ?? "—"}</TableCell>
                  <TableCell mono className="text-right">
                    {item.quantity ?? "—"}
                  </TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={item.unitPrice} />
                  </TableCell>
                  <TableCell mono className="text-right">
                    {item.cgstRate ?? "—"}
                  </TableCell>
                  <TableCell mono className="text-right">
                    {item.sgstRate ?? "—"}
                  </TableCell>
                  <TableCell mono className="text-right">
                    {item.igstRate ?? "—"}
                  </TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={item.lineTotal} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabPanel>

      <TabPanel id="payments" active={tab === "payments"}>
        {invoice.payments.length === 0 ? (
          <p className="type-helper text-steel">
            No payments nested on this invoice. GET /payments has no documented invoiceId filter.
          </p>
        ) : (
          <Table caption="Payments on this invoice">
            <TableHead>
              <TableHeaderCell>Payment</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Method</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableHead>
            <TableBody>
              {invoice.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell>
                    <Link className="hover:underline" href={`/finance/payments/${payment.id}`}>
                      Open payment
                    </Link>
                  </TableCell>
                  <TableCell>{enumLabel(payment.status)}</TableCell>
                  <TableCell mono>{enumLabel(payment.method)}</TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={payment.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabPanel>

      <TabPanel id="credits" active={tab === "credits"}>
        <Can permission="finance.manage">
          <div className="mb-4 flex justify-end">
            <Button onClick={() => setCreditOpen(true)}>Issue credit note</Button>
          </div>
        </Can>
        {invoice.creditNotes.length === 0 ? (
          <p className="type-helper text-steel">
            No credit notes nested on this invoice. GET /credit-notes has no documented invoiceId filter.
          </p>
        ) : (
          <Table caption="Credit notes">
            <TableHead>
              <TableHeaderCell>Number</TableHeaderCell>
              <TableHeaderCell>Reason</TableHeaderCell>
              <TableHeaderCell>Issued</TableHeaderCell>
              <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            </TableHead>
            <TableBody>
              {invoice.creditNotes.map((note) => (
                <TableRow key={note.id}>
                  <TableCell mono>{note.creditNoteNumber ?? note.id}</TableCell>
                  <TableCell>{enumLabel(note.reason)}</TableCell>
                  <TableCell mono>{formatTimestamp(note.issuedAt)}</TableCell>
                  <TableCell mono className="text-right">
                    <MoneyText value={note.amount} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TabPanel>

      <TabPanel id="documents" active={tab === "documents"}>
        <DocumentsPanel parent={{ invoiceId: invoice.id }} />
      </TabPanel>

      <Drawer open={editOpen} onClose={() => setEditOpen(false)} title="Edit draft">
        <InvoiceDueDateFields
          invoice={invoice}
          pending={updateMutation.isPending}
          onCancel={() => setEditOpen(false)}
          onSubmit={(values) => updateMutation.mutate(values)}
        />
      </Drawer>
      <Drawer open={linesOpen} onClose={() => setLinesOpen(false)} title="Replace line items">
        <InvoiceLineEditor
          items={invoice.lineItems}
          pending={linesMutation.isPending}
          onCancel={() => setLinesOpen(false)}
          onSubmit={(lines) => linesMutation.mutate(lines)}
        />
      </Drawer>
      <Drawer open={creditOpen} onClose={() => setCreditOpen(false)} title="Issue credit note">
        <CreditNoteFields
          invoiceId={invoice.id}
          pending={creditMutation.isPending}
          onCancel={() => setCreditOpen(false)}
          onSubmit={(values) => creditMutation.mutate(values)}
        />
      </Drawer>
      <ConfirmationDialog
        open={confirm === "SEND"}
        onClose={() => setConfirm(null)}
        onConfirm={() => sendMutation.mutate()}
        title="Send this invoice?"
        description="Send claims the invoice sequence and freezes bill-to plus line snapshots. The number is assigned by the backend."
        confirmLabel="Send invoice"
        pending={sendMutation.isPending}
      />
      <ConfirmationDialog
        open={confirm === "VOID"}
        onClose={() => setConfirm(null)}
        onConfirm={() => voidMutation.mutate()}
        title="Void this draft?"
        description="Void is allowed only on DRAFT invoices with zero payments."
        confirmLabel="Void"
        destructive
        pending={voidMutation.isPending}
      />
      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title="Cancel this invoice?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCancelOpen(false)}>
              Back
            </Button>
            <Button
              variant="destructive"
              loading={cancelMutation.isPending}
              onClick={() => {
                const parsed = cancelInvoiceSchema.safeParse({ reason: cancelReason });
                if (!parsed.success) {
                  setCancelError(parsed.error.issues[0]?.message);
                  return;
                }
                setCancelError(undefined);
                cancelMutation.mutate(parsed.data.reason);
              }}
            >
              Cancel invoice
            </Button>
          </>
        }
      >
        <p className="type-helper mb-4 text-steel">
          A reason is required. The backend may issue a credit note if payments exist.
        </p>
        <Field id="inv-cancel-reason" label="Reason" required error={cancelError}>
          <Textarea
            id="inv-cancel-reason"
            value={cancelReason}
            onChange={(event) => setCancelReason(event.target.value)}
            invalid={Boolean(cancelError)}
          />
        </Field>
      </Modal>
    </div>
  );
}
