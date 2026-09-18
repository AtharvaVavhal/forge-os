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
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconMore } from "@/components/icons";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { queryErrorMessage } from "@/lib/api/query-error";
import { listProjects } from "@/features/projects/api/projects-api";
import { projectKeys } from "@/features/projects/api/query-keys";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { formatDate } from "@/features/crm/format";
import { createExpense, listExpenses, updateExpense } from "../api/finance-api";
import { financeKeys } from "../api/query-keys";
import type { Expense } from "../api/types";
import { FinanceQueryState } from "./finance-query-state";
import { MoneyText } from "./money-text";
import { ExpenseFields } from "./finance-forms";

export function ExpensesPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { user } = useAuthorization();
  const filters = useMemo(() => ({ page, pageSize: 25, sort: "incurredAt:desc" }), [page]);

  const list = useQuery({
    queryKey: financeKeys.expenses.list(filters),
    queryFn: () => listExpenses(filters),
  });
  const projects = useQuery({
    queryKey: projectKeys.list({ page: 1, pageSize: 100 }),
    queryFn: () => listProjects({ page: 1, pageSize: 100 }),
    enabled: createOpen || editing !== null,
  });

  const createMutation = useMutation({
    mutationFn: (body: {
      description: string;
      amount: string;
      category: string;
      incurredAt: string;
      projectId?: string;
    }) => createExpense({ ...body, recordedBy: user.id }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.expenses.all });
      setCreateOpen(false);
      pushToast({ title: "Expense recorded", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t create expense", description: queryErrorMessage(error), tone: "danger" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateExpense>[1] }) =>
      updateExpense(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: financeKeys.expenses.all });
      setEditing(null);
      pushToast({ title: "Expense saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Finance"
        title="Expenses"
        description="Seven-field records. Edited in a drawer — no /expenses/[id] route."
        actions={
          <Can permission="finance.manage">
            <Button onClick={() => setCreateOpen(true)}>New expense</Button>
          </Can>
        }
      />
      <FinanceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No expenses"
        emptyDescription="Recorded spend appears here. This is not a ₹0 expense total."
      >
        <Table caption="Expenses">
          <TableHead>
            <TableHeaderCell>Description</TableHeaderCell>
            <TableHeaderCell>Category</TableHeaderCell>
            <TableHeaderCell>Project</TableHeaderCell>
            <TableHeaderCell>Incurred</TableHeaderCell>
            <TableHeaderCell className="text-right">Amount</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((expense) => (
              <TableRow key={expense.id}>
                <TableCell>{expense.description}</TableCell>
                <TableCell>{expense.category}</TableCell>
                <TableCell>{expense.project?.name ?? expense.projectId ?? "—"}</TableCell>
                <TableCell mono>{formatDate(expense.incurredAt)}</TableCell>
                <TableCell mono className="text-right">
                  <MoneyText value={expense.amount} />
                </TableCell>
                <TableRowActions>
                  <Can permission="finance.manage">
                    <Dropdown
                      trigger={({ open, setOpen, triggerId, menuId }) => (
                        <IconButton
                          id={triggerId}
                          label={`Actions for ${expense.description}`}
                          aria-haspopup="menu"
                          aria-expanded={open}
                          aria-controls={menuId}
                          onClick={() => setOpen(!open)}
                        >
                          <IconMore size={16} />
                        </IconButton>
                      )}
                    >
                      <DropdownItem onSelect={() => setEditing(expense)}>Edit</DropdownItem>
                    </Dropdown>
                  </Can>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} expenses` : undefined} />
      </FinanceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New expense">
        <ExpenseFields
          projects={projects.data?.items ?? []}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
      <Drawer open={editing !== null} onClose={() => setEditing(null)} title="Edit expense">
        {editing ? (
          <ExpenseFields
            expense={editing}
            projects={projects.data?.items ?? []}
            pending={updateMutation.isPending}
            onCancel={() => setEditing(null)}
            onSubmit={(values) => updateMutation.mutate({ id: editing.id, body: values })}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
