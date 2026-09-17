"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/features/crm/components/page-chrome";
import { lineItemSchema, proposalFormSchema } from "../schemas/proposal-forms";
import type { Proposal, ProposalLineItem } from "../api/types";

export function ProposalFields({
  deals,
  dealId,
  proposal,
  pending,
  onCancel,
  onSubmit,
}: {
  deals: Array<{ id: string; title: string }>;
  dealId?: string;
  proposal?: Proposal;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { dealId: string; terms?: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = proposalFormSchema.safeParse({
          dealId: form.get("dealId"),
          terms: form.get("terms"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit({
          dealId: parsed.data.dealId,
          terms: parsed.data.terms,
        });
      }}
    >
      <Field id="proposal-deal" label="Deal" required error={error}>
        <Select id="proposal-deal" name="dealId" defaultValue={dealId ?? proposal?.dealId ?? ""}>
          <option value="">Select a deal</option>
          {deals.map((deal) => (
            <option key={deal.id} value={deal.id}>
              {deal.title}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="proposal-terms" label="Terms">
        <Textarea id="proposal-terms" name="terms" defaultValue={proposal?.terms ?? ""} />
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel={proposal ? "Save draft" : "Create proposal"} />
    </form>
  );
}

export function LineItemsEditor({
  items,
  pending,
  onCancel,
  onSubmit,
}: {
  items: ProposalLineItem[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (
    lines: Array<{ description: string; quantity: string; unitPrice: string; sortOrder: number }>
  ) => void;
}) {
  const [rows, setRows] = useState(
    items.length
      ? items.map((item) => ({
          description: item.description,
          quantity: item.quantity ?? "1.00",
          unitPrice: item.unitPrice ?? "",
        }))
      : [{ description: "", quantity: "1.00", unitPrice: "" }]
  );
  const [error, setError] = useState<string | undefined>();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const parsed = rows.map((row) => lineItemSchema.safeParse(row));
        const failed = parsed.find((item) => !item.success);
        if (failed && !failed.success) {
          setError(failed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(
          parsed.flatMap((item, index) =>
            item.success
              ? [{ ...item.data, sortOrder: index }]
              : []
          )
        );
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      {rows.map((row, index) => (
        <div key={index} className="grid gap-3 sm:grid-cols-3">
          <Field id={`li-desc-${index}`} label="Description" required>
            <Input
              id={`li-desc-${index}`}
              value={row.description}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, description: event.target.value };
                setRows(next);
              }}
            />
          </Field>
          <Field id={`li-qty-${index}`} label="Quantity" required>
            <Input
              id={`li-qty-${index}`}
              value={row.quantity}
              onChange={(event) => {
                const next = [...rows];
                next[index] = { ...row, quantity: event.target.value };
                setRows(next);
              }}
            />
          </Field>
          <Field id={`li-rate-${index}`} label="Rate" required hint="Decimal string">
            <Input
              id={`li-rate-${index}`}
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
          onClick={() => setRows([...rows, { description: "", quantity: "1.00", unitPrice: "" }])}
        >
          Add line
        </Button>
        <FormActions onCancel={onCancel} pending={pending} submitLabel="Replace lines" />
      </div>
    </form>
  );
}
