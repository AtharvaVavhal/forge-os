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
import { Select } from "@/components/ui/select";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import {
  convertLead,
  createLead,
  getLead,
  listCompanies,
  listContacts,
  listLeads,
  transitionLead,
  updateLead,
} from "../api/crm-api";
import { nextLeadActions } from "../api/lifecycle";
import { crmKeys } from "../api/query-keys";
import { LEAD_SOURCES, LEAD_STATUSES, type LeadSource, type LeadStatus } from "../api/types";
import { enumLabel, formatTimestamp } from "../format";
import { LeadFields } from "./crm-forms";
import { FactList, PageHeader } from "./page-chrome";
import { ResourceQueryState } from "./resource-query-state";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";

const leadTone: Record<LeadStatus, StatusTone> = {
  NEW: "pending",
  CONTACTED: "info",
  QUALIFIED: "info",
  CONVERTED: "success",
  DISQUALIFIED: "neutral",
};

export function LeadsPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [status, setStatus] = useState<LeadStatus | "">("");
  const [source, setSource] = useState<LeadSource | "">("");
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const filters = useMemo(
    () => ({
      page,
      pageSize: 25,
      q: debouncedQ || undefined,
      status: status || undefined,
      source: source || undefined,
      sort: "createdAt:desc",
    }),
    [page, debouncedQ, status, source]
  );

  const list = useQuery({
    queryKey: crmKeys.leads.list(filters),
    queryFn: () => listLeads(filters),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100, sort: "createdAt:desc" }),
  });
  const contacts = useQuery({
    queryKey: crmKeys.contacts.list({ limit: 100 }),
    queryFn: () => listContacts({ limit: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: Parameters<typeof createLead>[0]) => createLead(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.leads.all });
      setCreateOpen(false);
      pushToast({ title: "Lead created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create lead", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="CRM"
        title="Leads"
        description="Lifecycle is command-based. Status cannot be patched arbitrarily."
        actions={
          <Can permission="crm.manage">
            <Button onClick={() => setCreateOpen(true)}>New lead</Button>
          </Can>
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search leads" />
        <Select
          aria-label="Status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value as LeadStatus | "");
            setPage(1);
          }}
          className="w-40"
        >
          <option value="">All statuses</option>
          {LEAD_STATUSES.map((item) => (
            <option key={item} value={item}>
              {enumLabel(item)}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Source"
          value={source}
          onChange={(event) => {
            setSource(event.target.value as LeadSource | "");
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All sources</option>
          {LEAD_SOURCES.map((item) => (
            <option key={item} value={item}>
              {enumLabel(item)}
            </option>
          ))}
        </Select>
      </FilterBar>
      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No leads"
        emptyDescription="Create a lead to start the CRM lifecycle."
      >
        <Table caption="Leads">
          <TableHead>
            <TableHeaderCell>Lead</TableHeaderCell>
            <TableHeaderCell>Company</TableHeaderCell>
            <TableHeaderCell>Contact</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Source</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((lead) => (
              <TableRow key={lead.id}>
                <TableCell>
                  <Link href={`/crm/leads/${lead.id}`} className="font-semibold hover:underline">
                    {lead.company?.name ?? lead.contact?.name ?? "Lead"}
                  </Link>
                </TableCell>
                <TableCell>{lead.company?.name ?? "—"}</TableCell>
                <TableCell>{lead.contact?.name ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge tone={leadTone[lead.status]}>{enumLabel(lead.status)}</StatusBadge>
                </TableCell>
                <TableCell>{enumLabel(lead.source)}</TableCell>
                <TableCell mono>{formatTimestamp(lead.createdAt)}</TableCell>
                <TableRowActions>
                  <Dropdown
                    trigger={({ open, setOpen, triggerId, menuId }) => (
                      <IconButton
                        id={triggerId}
                        label="Lead actions"
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen(!open)}
                      >
                        <IconMore size={16} />
                      </IconButton>
                    )}
                  >
                    <DropdownItem onSelect={() => router.push(`/crm/leads/${lead.id}`)}>Open</DropdownItem>
                  </Dropdown>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} leads` : undefined} />
      </ResourceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New lead">
        <LeadFields
          companies={companies.data?.items ?? []}
          contacts={contacts.data?.items ?? []}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
    </div>
  );
}

export function LeadDetailPage({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState<"CONVERT" | "DISQUALIFY" | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const query = useQuery({
    queryKey: crmKeys.leads.detail(id),
    queryFn: () => getLead(id),
  });
  const companies = useQuery({
    queryKey: crmKeys.companies.list({ page: 1, pageSize: 100 }),
    queryFn: () => listCompanies({ page: 1, pageSize: 100, sort: "createdAt:desc" }),
  });
  const contacts = useQuery({
    queryKey: crmKeys.contacts.list({ limit: 100 }),
    queryFn: () => listContacts({ limit: 100 }),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateLead>[1]) => updateLead(id, body),
    onSuccess: (lead) => {
      queryClient.setQueryData(crmKeys.leads.detail(id), lead);
      queryClient.invalidateQueries({ queryKey: crmKeys.leads.all });
      setEditing(false);
      pushToast({ title: "Lead saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const transitionMutation = useMutation({
    mutationFn: (to: Exclude<LeadStatus, "CONVERTED">) => transitionLead(id, to),
    onSuccess: (lead) => {
      queryClient.setQueryData(crmKeys.leads.detail(id), lead);
      queryClient.invalidateQueries({ queryKey: crmKeys.leads.all });
      setConfirm(null);
      pushToast({ title: `Lead ${enumLabel(lead.status).toLowerCase()}`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Transition failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const convertMutation = useMutation({
    mutationFn: () => convertLead(id),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.leads.all });
      queryClient.invalidateQueries({ queryKey: crmKeys.deals.all });
      queryClient.invalidateQueries({ queryKey: crmKeys.leads.detail(id) });
      setConfirm(null);
      pushToast({ title: "Lead converted", tone: "success" });
      router.push(`/crm/deals/${result.deal.id}`);
    },
    onError: (error) => pushToast({ title: "Conversion failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading lead" />;
  if (query.isError && (isNotFoundError(query.error) || isForbiddenError(query.error) || isUnauthorizedError(query.error))) {
    return <ForbiddenState />;
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const lead = query.data;
  const actions = nextLeadActions(lead.status);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Lead"
        title={lead.company?.name ?? lead.contact?.name ?? "Lead"}
        actions={
          <Can permission="crm.manage">
            <Button variant="secondary" onClick={() => setEditing(true)} disabled={lead.status === "CONVERTED"}>
              Edit
            </Button>
          </Can>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={leadTone[lead.status]}>{enumLabel(lead.status)}</StatusBadge>
        <p className="type-metadata text-steel">{enumLabel(lead.source)}</p>
      </div>

      <Can permission="crm.manage">
        {actions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {actions.includes("CONTACTED") ? (
              <Button
                onClick={() => transitionMutation.mutate("CONTACTED")}
                loading={transitionMutation.isPending}
              >
                Mark contacted
              </Button>
            ) : null}
            {actions.includes("QUALIFIED") ? (
              <Button
                onClick={() => transitionMutation.mutate("QUALIFIED")}
                loading={transitionMutation.isPending}
              >
                Mark qualified
              </Button>
            ) : null}
            {actions.includes("CONVERT") ? (
              <Button onClick={() => setConfirm("CONVERT")}>Convert to deal</Button>
            ) : null}
            {actions.includes("DISQUALIFY") ? (
              <Button variant="destructive" onClick={() => setConfirm("DISQUALIFY")}>
                Disqualify
              </Button>
            ) : null}
          </div>
        ) : null}
      </Can>

      <Panel title="Company and contact">
        <FactList
          items={[
            {
              label: "Company",
              value: lead.company ? (
                <Link className="hover:underline" href={`/crm/companies/${lead.company.id}`}>
                  {lead.company.name}
                </Link>
              ) : (
                "—"
              ),
            },
            {
              label: "Contact",
              value: lead.contact ? (
                <Link className="hover:underline" href={`/crm/contacts/${lead.contact.id}`}>
                  {lead.contact.name}
                </Link>
              ) : (
                "—"
              ),
            },
            {
              label: "Converted deal",
              value: lead.convertedToDealId ? (
                <Link className="hover:underline" href={`/crm/deals/${lead.convertedToDealId}`}>
                  Open deal
                </Link>
              ) : (
                "—"
              ),
            },
          ]}
        />
      </Panel>

      <Panel title="Lead information">
        <FactList
          items={[
            { label: "Notes", value: lead.notes ?? "—" },
            { label: "Created", value: formatTimestamp(lead.createdAt) },
            { label: "Updated", value: formatTimestamp(lead.updatedAt) },
          ]}
        />
        <p className="type-helper mt-4 text-steel">
          Activity is not a Lead parent in the frozen schema. Notes above are the Lead.notes field.
        </p>
      </Panel>

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit lead">
        <LeadFields
          lead={lead}
          companies={companies.data?.items ?? []}
          contacts={contacts.data?.items ?? []}
          pending={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateMutation.mutate(values)}
        />
      </Drawer>

      <ConfirmationDialog
        open={confirm === "CONVERT"}
        onClose={() => setConfirm(null)}
        onConfirm={() => convertMutation.mutate()}
        title="Convert this lead?"
        description="The backend will create a Deal and mark this lead converted. This cannot be done by changing status locally."
        confirmLabel="Confirm conversion"
        pending={convertMutation.isPending}
      />
      <ConfirmationDialog
        open={confirm === "DISQUALIFY"}
        onClose={() => setConfirm(null)}
        onConfirm={() => transitionMutation.mutate("DISQUALIFIED")}
        title="Disqualify this lead?"
        description="Disqualification is terminal. The lead row is kept."
        confirmLabel="Confirm disqualify"
        destructive
        pending={transitionMutation.isPending}
      />
    </div>
  );
}
