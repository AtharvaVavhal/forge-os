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
  TableRowActions,
} from "@/components/data-display/table";
import { Field } from "@/components/forms/field";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { queryErrorMessage } from "@/lib/api/query-error";
import { FormActions, PageHeader } from "@/features/crm/components/page-chrome";
import { formatDate } from "@/features/crm/format";
import { createTaxRate, listTaxRates, updateTaxRate } from "../api/finance-api";
import { financeKeys } from "../api/query-keys";
import type { TaxRate } from "../api/types";
import { createTaxRateFormSchema, updateTaxRateFormSchema } from "../schemas/finance-forms";
import { FinanceQueryState } from "./finance-query-state";

const RATE_HINT = 'Exactly two decimal places (e.g. "18.00"). Matches server TAX_RATE_REGEX.';

function TaxRateFields({
  taxRate,
  pending,
  onCancel,
  onSubmit,
}: {
  taxRate?: TaxRate;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: {
    hsnSacCode?: string;
    description: string;
    cgstRate: string;
    sgstRate: string;
    igstRate: string;
    effectiveFrom?: string;
    effectiveTo?: string;
  }) => void;
}) {
  const editing = Boolean(taxRate);
  const [error, setError] = useState<string | undefined>();

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        if (editing) {
          const parsed = updateTaxRateFormSchema.safeParse({
            description: form.get("description"),
            cgstRate: String(form.get("cgstRate") ?? "").trim(),
            sgstRate: String(form.get("sgstRate") ?? "").trim(),
            igstRate: String(form.get("igstRate") ?? "").trim(),
            effectiveTo: form.get("effectiveTo"),
          });
          if (!parsed.success) {
            setError(parsed.error.issues[0]?.message);
            return;
          }
          setError(undefined);
          onSubmit({
            description: parsed.data.description,
            cgstRate: parsed.data.cgstRate,
            sgstRate: parsed.data.sgstRate,
            igstRate: parsed.data.igstRate,
            effectiveTo: parsed.data.effectiveTo,
          });
          return;
        }

        const parsed = createTaxRateFormSchema.safeParse({
          hsnSacCode: form.get("hsnSacCode"),
          description: form.get("description"),
          cgstRate: String(form.get("cgstRate") ?? "").trim(),
          sgstRate: String(form.get("sgstRate") ?? "").trim(),
          igstRate: String(form.get("igstRate") ?? "").trim(),
          effectiveFrom: form.get("effectiveFrom"),
          effectiveTo: form.get("effectiveTo"),
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit({
          hsnSacCode: parsed.data.hsnSacCode,
          description: parsed.data.description,
          cgstRate: parsed.data.cgstRate,
          sgstRate: parsed.data.sgstRate,
          igstRate: parsed.data.igstRate,
          effectiveFrom: parsed.data.effectiveFrom,
          effectiveTo: parsed.data.effectiveTo,
        });
      }}
    >
      {error ? (
        <p
          className="font-display text-[length:var(--text-error-size)] text-ember-deep"
          role="alert"
          data-testid="tax-rate-validation-error"
        >
          {error}
        </p>
      ) : null}
      {!editing ? (
        <Field id="tax-hsn" label="HSN/SAC" required>
          <Input id="tax-hsn" name="hsnSacCode" maxLength={20} required />
        </Field>
      ) : null}
      <Field id="tax-description" label="Description" required>
        <Textarea
          id="tax-description"
          name="description"
          defaultValue={taxRate?.description ?? ""}
          maxLength={500}
          required
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field id="tax-cgst" label="CGST %" required hint={RATE_HINT}>
          <Input
            id="tax-cgst"
            name="cgstRate"
            inputMode="decimal"
            placeholder="18.00"
            defaultValue={taxRate?.cgstRate ?? ""}
            required
          />
        </Field>
        <Field id="tax-sgst" label="SGST %" required hint={RATE_HINT}>
          <Input
            id="tax-sgst"
            name="sgstRate"
            inputMode="decimal"
            placeholder="18.00"
            defaultValue={taxRate?.sgstRate ?? ""}
            required
          />
        </Field>
        <Field id="tax-igst" label="IGST %" required hint={RATE_HINT}>
          <Input
            id="tax-igst"
            name="igstRate"
            inputMode="decimal"
            placeholder="18.00"
            defaultValue={taxRate?.igstRate ?? ""}
            required
          />
        </Field>
      </div>
      {!editing ? (
        <Field id="tax-from" label="Effective from" required>
          <Input id="tax-from" name="effectiveFrom" type="date" required />
        </Field>
      ) : null}
      <Field id="tax-to" label="Effective to">
        <Input
          id="tax-to"
          name="effectiveTo"
          type="date"
          defaultValue={taxRate?.effectiveTo?.slice(0, 10) ?? ""}
        />
      </Field>
      <FormActions
        pending={pending}
        onCancel={onCancel}
        submitLabel={editing ? "Save tax rate" : "Create tax rate"}
      />
    </form>
  );
}

export function TaxRatesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<TaxRate | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const filters = useMemo(() => ({ page, pageSize: 25, sort: "createdAt:desc" }), [page]);

  const list = useQuery({
    queryKey: financeKeys.taxRates.list(filters),
    queryFn: () => listTaxRates(filters),
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createTaxRate>[0]) => createTaxRate(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.taxRates.all });
      setCreateOpen(false);
      pushToast({ title: "Tax rate created", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t create tax rate", description: queryErrorMessage(error), tone: "danger" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateTaxRate>[1] }) =>
      updateTaxRate(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.taxRates.all });
      setEditing(null);
      pushToast({ title: "Tax rate saved", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t save tax rate", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6" data-testid="tax-rates-page">
      <PageHeader
        kicker="Finance"
        title="Tax rates"
        description="HSN/SAC rates from GET/POST/PATCH /tax-rates. There is no detail route."
        actions={
          <Can permission="finance.manage">
            <Button onClick={() => setCreateOpen(true)}>New tax rate</Button>
          </Can>
        }
      />
      <FinanceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No tax rates"
        emptyDescription="Create an HSN/SAC rate before attaching it to invoice or proposal lines."
      >
        <Table caption="Tax rates">
          <TableHead>
            <TableHeaderCell>HSN/SAC</TableHeaderCell>
            <TableHeaderCell>Description</TableHeaderCell>
            <TableHeaderCell>CGST</TableHeaderCell>
            <TableHeaderCell>SGST</TableHeaderCell>
            <TableHeaderCell>IGST</TableHeaderCell>
            <TableHeaderCell>Effective</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((rate) => (
              <TableRow key={rate.id}>
                <TableCell mono>{rate.hsnSacCode}</TableCell>
                <TableCell>{rate.description}</TableCell>
                <TableCell mono>{rate.cgstRate ?? "—"}</TableCell>
                <TableCell mono>{rate.sgstRate ?? "—"}</TableCell>
                <TableCell mono>{rate.igstRate ?? "—"}</TableCell>
                <TableCell mono>
                  {formatDate(rate.effectiveFrom)}
                  {rate.effectiveTo ? ` → ${formatDate(rate.effectiveTo)}` : ""}
                </TableCell>
                <TableRowActions>
                  <Can permission="finance.manage">
                    <Dropdown
                      trigger={({ open, setOpen, triggerId, menuId }) => (
                        <IconButton
                          id={triggerId}
                          label={`Actions for ${rate.hsnSacCode}`}
                          aria-haspopup="menu"
                          aria-expanded={open}
                          aria-controls={menuId}
                          onClick={() => setOpen(!open)}
                        >
                          <IconMore size={16} />
                        </IconButton>
                      )}
                    >
                      <DropdownItem onSelect={() => setEditing(rate)}>Edit</DropdownItem>
                    </Dropdown>
                  </Can>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={total ? `${total} tax rates` : undefined}
        />
      </FinanceQueryState>

      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New tax rate">
        <TaxRateFields
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) =>
            createMutation.mutate({
              hsnSacCode: values.hsnSacCode!,
              description: values.description,
              cgstRate: values.cgstRate,
              sgstRate: values.sgstRate,
              igstRate: values.igstRate,
              effectiveFrom: values.effectiveFrom!,
              effectiveTo: values.effectiveTo,
            })
          }
        />
      </Drawer>

      <Drawer open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit tax rate">
        {editing ? (
          <TaxRateFields
            taxRate={editing}
            pending={updateMutation.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(values) =>
              updateMutation.mutate({
                id: editing.id,
                body: {
                  description: values.description,
                  cgstRate: values.cgstRate,
                  sgstRate: values.sgstRate,
                  igstRate: values.igstRate,
                  effectiveTo: values.effectiveTo,
                },
              })
            }
          />
        ) : null}
      </Drawer>
    </div>
  );
}
