"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FilterBar, SearchInput } from "@/components/data-display/filter-bar";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { queryErrorMessage } from "@/lib/api/query-error";
import { archiveCompany, createCompany, listCompanies, updateCompany } from "../api/crm-api";
import { crmKeys } from "../api/query-keys";
import type { Company } from "../api/types";
import { formatTimestamp } from "../format";
import { CompanyFields } from "./crm-forms";
import { PageHeader } from "./page-chrome";
import { ResourceQueryState } from "./resource-query-state";

export function CompaniesPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [archived, setArchived] = useState<"omit" | "false" | "true">("omit");
  const [tag, setTag] = useState("");
  const debouncedTag = useDebouncedValue(tag);
  const [page, setPage] = useState(1);
  const [drawer, setDrawer] = useState<{ mode: "create" } | { mode: "edit"; company: Company } | null>(null);
  const [archiveId, setArchiveId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const filters = useMemo(
    () => ({
      page,
      pageSize: 25,
      q: debouncedQ || undefined,
      tag: debouncedTag || undefined,
      archived: archived === "omit" ? undefined : archived === "true",
    }),
    [page, debouncedQ, debouncedTag, archived]
  );

  const list = useQuery({
    queryKey: crmKeys.companies.list(filters),
    queryFn: () => listCompanies(filters),
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createCompany>[0]) => createCompany(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies.all });
      setDrawer(null);
      pushToast({ title: "Company created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create company", description: queryErrorMessage(error), tone: "danger" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Parameters<typeof updateCompany>[1] }) => updateCompany(id, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies.all });
      setDrawer(null);
      pushToast({ title: "Company saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save company", description: queryErrorMessage(error), tone: "danger" }),
  });

  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies.all });
      setArchiveId(null);
      pushToast({ title: "Company archived", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t archive company", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="CRM"
        title="Companies"
        description="Organization-scoped companies. Archive is a soft-delete; nothing is hard-deleted."
        actions={
          <Can permission="crm.manage">
            <Button onClick={() => setDrawer({ mode: "create" })}>New company</Button>
          </Can>
        }
      />

      <FilterBar>
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search companies" />
        <Input
          aria-label="Tag"
          value={tag}
          onChange={(event) => {
            setTag(event.target.value);
            setPage(1);
          }}
          placeholder="Tag"
          className="h-9 min-h-9 w-40"
        />
        <Select
          aria-label="Archive filter"
          value={archived}
          onChange={(event) => {
            setArchived(event.target.value as typeof archived);
            setPage(1);
          }}
          className="w-40"
        >
          <option value="omit">All</option>
          <option value="false">Active</option>
          <option value="true">Archived</option>
        </Select>
      </FilterBar>

      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No companies"
        emptyDescription="Create a company to begin CRM records. No sample rows are shown."
      >
        <Table caption="Companies">
          <TableHead>
            <TableHeaderCell>Company</TableHeaderCell>
            <TableHeaderCell>GSTIN</TableHeaderCell>
            <TableHeaderCell>State</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((company) => (
              <TableRow key={company.id}>
                <TableCell>
                  <Link href={`/crm/companies/${company.id}`} className="font-semibold hover:underline">
                    {company.name}
                  </Link>
                </TableCell>
                <TableCell mono>{company.gstin ?? "—"}</TableCell>
                <TableCell>{company.billingState ?? "—"}</TableCell>
                <TableCell mono>{formatTimestamp(company.createdAt)}</TableCell>
                <TableRowActions>
                  <Dropdown
                    trigger={({ open, setOpen, triggerId, menuId }) => (
                      <IconButton
                        id={triggerId}
                        label={`Actions for ${company.name}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen(!open)}
                      >
                        <IconMore size={16} />
                      </IconButton>
                    )}
                  >
                    <DropdownItem onSelect={() => router.push(`/crm/companies/${company.id}`)}>Open</DropdownItem>
                    <Can permission="crm.manage">
                      <DropdownItem onSelect={() => setDrawer({ mode: "edit", company })}>Edit</DropdownItem>
                      <DropdownItem destructive onSelect={() => setArchiveId(company.id)}>
                        Archive
                      </DropdownItem>
                    </Can>
                  </Dropdown>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination
          page={page}
          pageCount={pageCount}
          onPageChange={setPage}
          summary={total ? `${total} companies` : undefined}
        />
      </ResourceQueryState>

      <Drawer
        open={drawer !== null}
        onClose={() => setDrawer(null)}
        title={drawer?.mode === "edit" ? "Edit company" : "New company"}
      >
        {drawer ? (
          <CompanyFields
            company={drawer.mode === "edit" ? drawer.company : undefined}
            pending={createMutation.isPending || updateMutation.isPending}
            onCancel={() => setDrawer(null)}
            onSubmit={(values) => {
              if (drawer.mode === "edit") updateMutation.mutate({ id: drawer.company.id, body: values });
              else createMutation.mutate(values);
            }}
          />
        ) : null}
      </Drawer>

      <ConfirmationDialog
        open={archiveId !== null}
        onClose={() => setArchiveId(null)}
        onConfirm={() => archiveId && archiveMutation.mutate(archiveId)}
        title="Archive this company?"
        description="The company will be soft-archived. This does not hard-delete the record."
        confirmLabel="Archive"
        destructive
        pending={archiveMutation.isPending}
      />
    </div>
  );
}
