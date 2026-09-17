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
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { Modal, ConfirmationDialog } from "@/components/overlays/modal";
import { Panel } from "@/components/ui/panel";
import { Field } from "@/components/forms/field";
import { Alert } from "@/components/feedback/alert";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { useAuthorization } from "@/features/auth/authorization/authorization-context";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { formatInr } from "@/lib/money/format-inr";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { ApiClientError } from "@forge/api-client";
import {
  createDeal,
  getDeal,
  listCompanies,
  listContacts,
  listDeals,
  reopenDeal,
  transitionDeal,
  updateDeal,
} from "../api/crm-api";
import { isTerminalDeal, nextDealStage } from "../api/lifecycle";
import { crmKeys } from "../api/query-keys";
import { projectKeys } from "@/features/projects/api/query-keys";
import { salesKeys } from "@/features/sales/api/query-keys";
import {
  DEAL_LOST_REASONS,
  DEAL_STAGES,
  type DealLostReason,
  type DealStage,
} from "../api/types";
import { enumLabel, formatTimestamp } from "../format";
import { ActivityFeed } from "./activity-feed";
import { NotesPanel } from "@/features/shared/components/notes-panel";
import { DocumentsPanel } from "@/features/shared/components/documents-panel";
import { DealFields } from "./crm-forms";
import { FactList, PageHeader } from "./page-chrome";
import { ResourceQueryState } from "./resource-query-state";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";

const dealTone: Record<DealStage, StatusTone> = {
  NEW: "pending",
  CONTACTED: "info",
  QUALIFIED: "info",
  DISCOVERY: "info",
  PROPOSAL_SENT: "warning",
  NEGOTIATION: "warning",
  WON: "success",
  LOST: "danger",
};

export function DealsPage() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q);
  const [stage, setStage] = useState<DealStage | "">("");
  const [mineOnly, setMineOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();
  const { user } = useAuthorization();

  const filters = useMemo(
    () => ({
      page,
      pageSize: 25,
      q: debouncedQ || undefined,
      stage: stage || undefined,
      ownerId: mineOnly ? user.id : undefined,
      sort: "createdAt:desc",
    }),
    [page, debouncedQ, stage, mineOnly, user.id]
  );

  const list = useQuery({
    queryKey: crmKeys.deals.list(filters),
    queryFn: () => listDeals(filters),
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
    mutationFn: (body: Parameters<typeof createDeal>[0]) => createDeal(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.deals.all });
      setCreateOpen(false);
      pushToast({ title: "Deal created", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t create deal", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="CRM"
        title="Deals"
        description="Stage changes use POST /deals/:id/transition. PATCH cannot set stage."
        actions={
          <Can permission="crm.manage">
            <Button onClick={() => setCreateOpen(true)}>New deal</Button>
          </Can>
        }
      />
      <FilterBar>
        <SearchInput value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search deals" />
        <Select
          aria-label="Stage"
          value={stage}
          onChange={(event) => {
            setStage(event.target.value as DealStage | "");
            setPage(1);
          }}
          className="w-44"
        >
          <option value="">All stages</option>
          {DEAL_STAGES.map((item) => (
            <option key={item} value={item}>
              {enumLabel(item)}
            </option>
          ))}
        </Select>
        <Checkbox
          label="My deals"
          checked={mineOnly}
          onChange={(event) => {
            setMineOnly(event.target.checked);
            setPage(1);
          }}
        />
      </FilterBar>
      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No deals"
        emptyDescription="Create a deal or convert a qualified lead."
      >
        <Table caption="Deals">
          <TableHead>
            <TableHeaderCell>Deal</TableHeaderCell>
            <TableHeaderCell>Company</TableHeaderCell>
            <TableHeaderCell>Stage</TableHeaderCell>
            <TableHeaderCell>Value</TableHeaderCell>
            <TableHeaderCell>Owner</TableHeaderCell>
            <TableHeaderCell>Created</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((deal) => (
              <TableRow key={deal.id}>
                <TableCell>
                  <Link href={`/crm/deals/${deal.id}`} className="font-semibold hover:underline">
                    {deal.title}
                  </Link>
                </TableCell>
                <TableCell>{deal.company?.name ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge tone={dealTone[deal.stage]}>{enumLabel(deal.stage)}</StatusBadge>
                </TableCell>
                <TableCell mono>{deal.estimatedValue ? formatInr(deal.estimatedValue) : "—"}</TableCell>
                <TableCell mono>{deal.ownerId}</TableCell>
                <TableCell mono>{formatTimestamp(deal.createdAt)}</TableCell>
                <TableRowActions>
                  <Dropdown
                    trigger={({ open, setOpen, triggerId, menuId }) => (
                      <IconButton
                        id={triggerId}
                        label={`Actions for ${deal.title}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen(!open)}
                      >
                        <IconMore size={16} />
                      </IconButton>
                    )}
                  >
                    <DropdownItem onSelect={() => router.push(`/crm/deals/${deal.id}`)}>Open</DropdownItem>
                  </Dropdown>
                </TableRowActions>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <Pagination page={page} pageCount={pageCount} onPageChange={setPage} summary={total ? `${total} deals` : undefined} />
      </ResourceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New deal">
        <DealFields
          companies={companies.data?.items ?? []}
          contacts={contacts.data?.items ?? []}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate({ ...values, ownerId: user.id })}
        />
      </Drawer>
    </div>
  );
}

export function DealDetailPage({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<DealLostReason>("PRICE");
  const [wonOpen, setWonOpen] = useState(false);
  const [wonError, setWonError] = useState<{ code: string; message: string } | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const query = useQuery({
    queryKey: crmKeys.deals.detail(id),
    queryFn: () => getDeal(id),
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
    mutationFn: (body: Parameters<typeof updateDeal>[1]) => updateDeal(id, body),
    onSuccess: (deal) => {
      queryClient.setQueryData(crmKeys.deals.detail(id), deal);
      queryClient.invalidateQueries({ queryKey: crmKeys.deals.all });
      setEditing(false);
      pushToast({ title: "Deal saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const transitionMutation = useMutation({
    mutationFn: ({ to, lostReason: reason }: { to: DealStage; lostReason?: DealLostReason }) =>
      transitionDeal(id, to, reason),
    onSuccess: (deal) => {
      queryClient.setQueryData(crmKeys.deals.detail(id), deal);
      queryClient.invalidateQueries({ queryKey: crmKeys.deals.all });
      queryClient.invalidateQueries({ queryKey: projectKeys.all });
      queryClient.invalidateQueries({ queryKey: salesKeys.proposals.all });
      setLostOpen(false);
      setWonOpen(false);
      setWonError(null);
      pushToast({ title: `Deal ${enumLabel(deal.stage).toLowerCase()}`, tone: "success" });
    },
    onError: (error) => {
      if (error instanceof ApiClientError && error.code === "DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL") {
        setWonError({ code: error.code, message: error.message });
        setWonOpen(false);
      }
      pushToast({ title: "Transition failed", description: queryErrorMessage(error), tone: "danger" });
    },
  });

  const reopenMutation = useMutation({
    mutationFn: () => reopenDeal(id),
    onSuccess: (deal) => {
      queryClient.invalidateQueries({ queryKey: crmKeys.deals.all });
      pushToast({ title: "Deal reopened", description: "A new deal was created from this one.", tone: "success" });
      router.push(`/crm/deals/${deal.id}`);
    },
    onError: (error) => pushToast({ title: "Reopen failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading deal" />;
  if (query.isError && (isNotFoundError(query.error) || isForbiddenError(query.error) || isUnauthorizedError(query.error))) {
    return <ForbiddenState />;
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const deal = query.data;
  const next = nextDealStage(deal.stage);
  const terminal = isTerminalDeal(deal.stage);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Deal"
        title={deal.title}
        actions={
          <Can permission="crm.manage">
            {terminal ? null : (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit
              </Button>
            )}
          </Can>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={dealTone[deal.stage]}>{enumLabel(deal.stage)}</StatusBadge>
        <p className="type-metadata text-ink">
          {deal.estimatedValue ? formatInr(deal.estimatedValue) : "—"}
        </p>
      </div>

      <Can permission="crm.manage">
        <div className="flex flex-wrap gap-2">
          {!terminal && next && next !== "WON" ? (
            <Button
              onClick={() => transitionMutation.mutate({ to: next })}
              loading={transitionMutation.isPending}
            >
              Advance to {enumLabel(next)}
            </Button>
          ) : null}
          {!terminal ? (
            <Button variant="secondary" onClick={() => setWonOpen(true)}>
              Mark won
            </Button>
          ) : null}
          {!terminal ? (
            <Button variant="destructive" onClick={() => setLostOpen(true)}>
              Mark lost
            </Button>
          ) : null}
          {terminal ? (
            <Button variant="secondary" onClick={() => reopenMutation.mutate()} loading={reopenMutation.isPending}>
              Reopen as new deal
            </Button>
          ) : null}
        </div>
      </Can>

      <Panel title="Company and contact">
        <FactList
          items={[
            {
              label: "Company",
              value: deal.company ? (
                <Link className="hover:underline" href={`/crm/companies/${deal.company.id}`}>
                  {deal.company.name}
                </Link>
              ) : (
                "—"
              ),
            },
            {
              label: "Contact",
              value: deal.contact ? (
                <Link className="hover:underline" href={`/crm/contacts/${deal.contact.id}`}>
                  {deal.contact.name}
                </Link>
              ) : (
                "—"
              ),
            },
            { label: "Owner", value: deal.ownerId },
            { label: "Lost reason", value: deal.lostReason ? enumLabel(deal.lostReason) : "—" },
            { label: "Follow-up", value: formatTimestamp(deal.nextFollowUpAt) },
            {
              label: "Reopened from",
              value: deal.reopenedFromDealId ? (
                <Link className="hover:underline" href={`/crm/deals/${deal.reopenedFromDealId}`}>
                  Prior deal
                </Link>
              ) : (
                "—"
              ),
            },
          ]}
        />
      </Panel>

      <Panel kicker="Sales" title="Proposal">
        <p className="type-helper text-steel">
          Won requires an accepted proposal on the backend (`DEAL_WON_REQUIRES_ACCEPTED_PROPOSAL`).
          This screen does not list proposals because `GET /proposals` has no documented `dealId`
          filter in the frozen contract.
        </p>
        <Can permission="sales.manage">
          <p className="mt-3">
            <Link className="font-semibold hover:underline" href={`/projects/proposals?dealId=${deal.id}`}>
              Create proposal for this deal
            </Link>
          </p>
        </Can>
        {wonError ? (
          <Alert className="mt-4" tone="warning" title="Accepted proposal required">
            <p>{wonError.message}</p>
            <p className="mt-2">
              The deal was not marked won. Create a proposal, send it, and wait for portal acceptance
              (`POST /portal/proposals/:id/accept`). Then retry Mark won.
            </p>
          </Alert>
        ) : null}
      </Panel>

      <Panel kicker="Feed" title="Activity">
        <ActivityFeed dealId={deal.id} />
      </Panel>

      <NotesPanel parent={{ dealId: deal.id }} />
      <DocumentsPanel parent={{ dealId: deal.id }} />

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit deal">
        <DealFields
          deal={deal}
          companies={companies.data?.items ?? []}
          contacts={contacts.data?.items ?? []}
          pending={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateMutation.mutate(values)}
        />
      </Drawer>

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title="Mark deal lost"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLostOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={transitionMutation.isPending}
              onClick={() => transitionMutation.mutate({ to: "LOST", lostReason })}
            >
              Confirm lost
            </Button>
          </>
        }
      >
        <Field id="lost-reason" label="Lost reason" required>
          <Select
            id="lost-reason"
            value={lostReason}
            onChange={(event) => setLostReason(event.target.value as DealLostReason)}
          >
            {DEAL_LOST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {enumLabel(reason)}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <ConfirmationDialog
        open={wonOpen}
        onClose={() => setWonOpen(false)}
        onConfirm={() => transitionMutation.mutate({ to: "WON" })}
        title="Mark deal won?"
        description="The backend will reject this if there is no accepted proposal. The frontend does not bypass that rule."
        confirmLabel="Confirm won"
        pending={transitionMutation.isPending}
      />
    </div>
  );
}
