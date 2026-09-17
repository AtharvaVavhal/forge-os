"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/features/crm/components/page-chrome";
import { enumLabel } from "@/features/crm/format";
import {
  CREDIT_NOTE_REASONS,
  FORGE_FUND_ENTRY_TYPES,
  OFFLINE_PAYMENT_METHODS,
  type CreditNoteReason,
  type Expense,
  type ForgeFundEntryType,
  type Invoice,
  type InvoiceLineItem,
  type OfflinePaymentMethod,
} from "../api/types";
import {
  creditNoteFormSchema,
  expenseFormSchema,
  forgeFundEntrySchema,
  invoiceFormSchema,
  invoiceFromProposalSchema,
  invoiceLineSchema,
  paymentFormSchema,
  refundFormSchema,
} from "../schemas/finance-forms";

export function InvoiceFields({
  companies,
  pending,
  onCancel,
  onSubmit,
}: {
  companies: Array<{ id: string; name: string }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { companyId: string; dueDate?: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = invoiceFormSchema.safeParse({
          companyId: form.get("companyId"),
          dueDate: form.get("dueDate"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit({ companyId: parsed.data.companyId, dueDate: parsed.data.dueDate });
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="inv-company" label="Company" required hint="Tax treatment is computed by the backend from billing states.">
        <Select id="inv-company" name="companyId">
          <option value="">Select a company</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="inv-due" label="Due date">
        <Input id="inv-due" name="dueDate" type="date" />
      </Field>
      <p className="type-helper text-steel">Invoice numbers are assigned on send. This form does not generate them.</p>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Create draft" />
    </form>
  );
}

export function InvoiceFromProposalFields({
  proposals,
  pending,
  onCancel,
  onSubmit,
}: {
  proposals: Array<{ id: string; version: number; status: string; dealId: string }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (proposalId: string) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = invoiceFromProposalSchema.safeParse({ proposalId: form.get("proposalId") });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data.proposalId);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field
        id="inv-proposal"
        label="Proposal"
        required
        hint="Copies snapshot lines. The backend rejects proposals that are not accepted."
      >
        <Select id="inv-proposal" name="proposalId">
          <option value="">Select a proposal</option>
          {proposals.map((proposal) => (
            <option key={proposal.id} value={proposal.id}>
              v{proposal.version} · {proposal.status} · {proposal.dealId}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Create from proposal" />
    </form>
  );
}

export function InvoiceLineEditor({
  items,
  pending,
  onCancel,
  onSubmit,
}: {
  items: InvoiceLineItem[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (
    lines: Array<{
      description: string;
      quantity: string;
      unitPrice: string;
      hsnSacCode: string;
      sortOrder: number;
    }>
  ) => void;
}) {
  const [rows, setRows] = useState(
    items.length
      ? items.map((item) => ({
          description: item.description,
          quantity: item.quantity ?? "1.00",
          unitPrice: item.unitPrice ?? "",
          hsnSacCode: item.hsnSacCode ?? "",
        }))
      : [{ description: "", quantity: "1.00", unitPrice: "", hsnSacCode: "" }]
  );
  const [error, setError] = useState<string | undefined>();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = rows.map((row) => invoiceLineSchema.safeParse(row));
        const failed = parsed.find((item) => !item.success);
        if (failed && !failed.success) {
          setError(failed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(
          parsed.flatMap((item, index) => (item.success ? [{ ...item.data, sortOrder: index }] : []))
        );
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <p className="type-helper text-steel">
        Line totals and tax are snapshots computed by the backend. This form does not multiply quantity × rate.
      </p>
      {rows.map((row, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-2">
          <Field id={`inv-li-desc-${index}`} label="Description" required>
            <Input
              id={`inv-li-desc-${index}`}
              value={row.description}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, description: event.target.value };
                setRows(next);
              }}
            />
          </Field>
          <Field id={`inv-li-hsn-${index}`} label="HSN/SAC" required>
            <Input
              id={`inv-li-hsn-${index}`}
              value={row.hsnSacCode}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, hsnSacCode: event.target.value };
                setRows(next);
              }}
            />
          </Field>
          <Field id={`inv-li-qty-${index}`} label="Quantity" required>
            <Input
              id={`inv-li-qty-${index}`}
              value={row.quantity}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, quantity: event.target.value };
                setRows(next);
              }}
            />
          </Field>
          <Field id={`inv-li-rate-${index}`} label="Rate" required hint="Decimal string">
            <Input
              id={`inv-li-rate-${index}`}
              value={row.unitPrice}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, unitPrice: event.target.value };
                setRows(next);
              }}
            />
          </Field>
        </div>
      ))}
      <div className="flex justify-between">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setRows([...rows, { description: "", quantity: "1.00", unitPrice: "", hsnSacCode: "" }])}
        >
          Add line
        </Button>
        <FormActions onCancel={onCancel} pending={pending} submitLabel="Replace lines" />
      </div>
    </form>
  );
}

export function InvoiceDueDateFields({
  invoice,
  pending,
  onCancel,
  onSubmit,
}: {
  invoice: Invoice;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { dueDate?: string }) => void;
}) {
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const dueDate = String(form.get("dueDate") ?? "").trim() || undefined;
        onSubmit({ dueDate });
      }}
    >
      <Field id="inv-edit-due" label="Due date">
        <Input id="inv-edit-due" name="dueDate" type="date" defaultValue={invoice.dueDate?.slice(0, 10)} />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Save draft" />
    </form>
  );
}

export function PaymentFields({
  invoices,
  pending,
  onCancel,
  onSubmit,
}: {
  invoices: Array<{ id: string; invoiceNumber: string | null }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    invoiceId: string;
    amount: string;
    method: OfflinePaymentMethod;
    referenceNote?: string;
    paidAt?: string;
  }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = paymentFormSchema.safeParse({
          invoiceId: form.get("invoiceId"),
          amount: form.get("amount"),
          method: form.get("method"),
          referenceNote: form.get("referenceNote"),
          paidAt: form.get("paidAt"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="pay-invoice" label="Invoice" required>
        <Select id="pay-invoice" name="invoiceId">
          <option value="">Select an invoice</option>
          {invoices.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.invoiceNumber ?? invoice.id}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="pay-amount" label="Amount" required hint="Decimal string. Backend updates invoice paid_amount.">
        <Input id="pay-amount" name="amount" inputMode="decimal" />
      </Field>
      <Field id="pay-method" label="Method" required hint="Razorpay payments are created by the gateway, not this form.">
        <Select id="pay-method" name="method" defaultValue="BANK_TRANSFER">
          {OFFLINE_PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {enumLabel(method)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="pay-ref" label="Reference">
        <Input id="pay-ref" name="referenceNote" />
      </Field>
      <Field id="pay-at" label="Paid at">
        <Input id="pay-at" name="paidAt" type="date" />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Save payment" />
    </form>
  );
}

export function RefundFields({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { amount: string; reason: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = refundFormSchema.safeParse({
          amount: form.get("amount"),
          reason: form.get("reason"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="refund-amount" label="Amount" required>
        <Input id="refund-amount" name="amount" inputMode="decimal" />
      </Field>
      <Field id="refund-reason" label="Reason" required>
        <Textarea id="refund-reason" name="reason" />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Request refund" />
    </form>
  );
}

export function CreditNoteFields({
  invoiceId,
  pending,
  onCancel,
  onSubmit,
}: {
  invoiceId: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { invoiceId: string; reason: CreditNoteReason; amount: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = creditNoteFormSchema.safeParse({
          invoiceId,
          reason: form.get("reason"),
          amount: form.get("amount"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <Field id="cn-reason" label="Reason" required>
        <Select id="cn-reason" name="reason" defaultValue="SCOPE_REDUCTION">
          {CREDIT_NOTE_REASONS.map((reason) => (
            <option key={reason} value={reason}>
              {enumLabel(reason)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="cn-amount" label="Amount" required hint="May be 0.00 for a documentation-only credit note.">
        <Input id="cn-amount" name="amount" inputMode="decimal" />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Issue note" />
    </form>
  );
}

export function ExpenseFields({
  expense,
  projects,
  pending,
  onCancel,
  onSubmit,
}: {
  expense?: Expense;
  projects: Array<{ id: string; name: string }>;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    description: string;
    amount: string;
    category: string;
    incurredAt: string;
    projectId?: string;
  }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = expenseFormSchema.safeParse({
          description: form.get("description"),
          amount: form.get("amount"),
          category: form.get("category"),
          incurredAt: form.get("incurredAt"),
          projectId: form.get("projectId"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="exp-desc" label="Description" required>
        <Input id="exp-desc" name="description" defaultValue={expense?.description} />
      </Field>
      <Field id="exp-amount" label="Amount" required>
        <Input id="exp-amount" name="amount" inputMode="decimal" defaultValue={expense?.amount ?? ""} />
      </Field>
      <Field id="exp-cat" label="Category" required hint="Free-text on Expense.category. No enum is documented.">
        <Input id="exp-cat" name="category" defaultValue={expense?.category} />
      </Field>
      <Field id="exp-date" label="Incurred at" required>
        <Input id="exp-date" name="incurredAt" type="date" defaultValue={expense?.incurredAt?.slice(0, 10)} />
      </Field>
      <Field id="exp-project" label="Project">
        <Select id="exp-project" name="projectId" defaultValue={expense?.projectId ?? ""}>
          <option value="">None</option>
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={expense ? "Save" : "Create expense"} />
    </form>
  );
}

export function ForgeFundFields({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { type: ForgeFundEntryType; amount: string; reason: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = forgeFundEntrySchema.safeParse({
          type: form.get("type"),
          amount: form.get("amount"),
          reason: form.get("reason"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="ff-type" label="Type" required>
        <Select id="ff-type" name="type" defaultValue="CONTRIBUTION">
          {FORGE_FUND_ENTRY_TYPES.map((type) => (
            <option key={type} value={type}>
              {enumLabel(type)}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="ff-amount"
        label="Amount"
        required
        hint="Document 5 example sends a positive decimal string. The ledger displays the signed amount the backend stores."
      >
        <Input id="ff-amount" name="amount" inputMode="decimal" />
      </Field>
      <Field id="ff-reason" label="Reason" required>
        <Textarea id="ff-reason" name="reason" />
      </Field>
      <p className="type-helper text-steel">No split formula is applied. Each row is one explicit entry.</p>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Post entry" />
    </form>
  );
}
