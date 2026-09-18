"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Dropdown, DropdownItem } from "@/components/overlays/dropdown";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { formatInr } from "@/lib/money/format-inr";
import { listDeals } from "@/features/crm/api/crm-api";
import { crmKeys } from "@/features/crm/api/query-keys";
import { ActivityFeed } from "@/features/crm/components/activity-feed";
import { FactList, PageHeader } from "@/features/crm/components/page-chrome";
import { ResourceQueryState } from "@/features/crm/components/resource-query-state";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import {
  createProposal,
  getProposal,
  listProposals,
  replaceProposalLineItems,
  reviseProposal,
  sendProposal,
  transitionProposal,
  updateProposal,
} from "../api/sales-api";
import { canReviseProposal, isDraftProposal, nextProposalTransitions } from "../api/lifecycle";
import { salesKeys } from "../api/query-keys";
import type { ProposalStatus } from "../api/types";
import { LineItemsEditor, ProposalFields } from "./proposal-forms";

const proposalTone: Record<ProposalStatus, StatusTone> = {
  DRAFT: "pending",
  SENT: "info",
  VIEWED: "info",
  ACCEPTED: "success",
  REJECTED: "danger",
  EXPIRED: "neutral",
};

export function ProposalsPage({ presetDealId }: { presetDealId?: string }) {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(Boolean(presetDealId));
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const filters = useMemo(
    () => ({ page, pageSize: 25, sort: "createdAt:desc" }),
    [page]
  );

  const list = useQuery({
    queryKey: salesKeys.proposals.list(filters),
    queryFn: () => listProposals(filters),
  });
  const deals = useQuery({
    queryKey: crmKeys.deals.list({ page: 1, pageSize: 100 }),
    queryFn: () => listDeals({ page: 1, pageSize: 100 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: { dealId: string; terms?: string }) => createProposal(body),
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.proposals.all });
      setCreateOpen(false);
      pushToast({ title: "Proposal created", description: `Version ${proposal.version}`, tone: "success" });
      router.push(`/projects/proposals/${proposal.id}`);
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t create proposal", description: queryErrorMessage(error), tone: "danger" }),
  });

  const total = list.data?.total ?? 0;
  const pageCount = list.data ? Math.max(1, Math.ceil((total || list.data.items.length) / list.data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Sales"
        title="Proposals"
        description="Owned by the sales module. Grouped under Projects in navigation. Versions are immutable after send."
        actions={
          <Can permission="sales.manage">
            <Button onClick={() => setCreateOpen(true)}>New proposal</Button>
          </Can>
        }
      />
      <ResourceQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No proposals"
        emptyDescription="Create a draft against a deal. No sample rows are shown."
      >
        <Table caption="Proposals">
          <TableHead>
            <TableHeaderCell>Proposal</TableHeaderCell>
            <TableHeaderCell>Deal</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Sent</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((proposal) => (
              <TableRow key={proposal.id}>
                <TableCell>
                  <Link href={`/projects/proposals/${proposal.id}`} className="font-semibold hover:underline">
                    Proposal v{proposal.version}
                  </Link>
                </TableCell>
                <TableCell>
                  {proposal.deal ? (
                    <Link href={`/crm/deals/${proposal.deal.id}`} className="hover:underline">
                      {proposal.deal.name}
                    </Link>
                  ) : (
                    <Link href={`/crm/deals/${proposal.dealId}`} className="type-metadata hover:underline">
                      {proposal.dealId}
                    </Link>
                  )}
                </TableCell>
                <TableCell>
                  <StatusBadge tone={proposalTone[proposal.status]}>{enumLabel(proposal.status)}</StatusBadge>
                </TableCell>
                <TableCell mono>{formatTimestamp(proposal.sentAt)}</TableCell>
                <TableRowActions>
                  <Dropdown
                    trigger={({ open, setOpen, triggerId, menuId }) => (
                      <IconButton
                        id={triggerId}
                        label={`Actions for proposal v${proposal.version}`}
                        aria-haspopup="menu"
                        aria-expanded={open}
                        aria-controls={menuId}
                        onClick={() => setOpen(!open)}
                      >
                        <IconMore size={16} />
                      </IconButton>
                    )}
                  >
                    <DropdownItem onSelect={() => router.push(`/projects/proposals/${proposal.id}`)}>Open</DropdownItem>
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
          summary={total ? `${total} proposals` : undefined}
        />
      </ResourceQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="New proposal">
        <ProposalFields
          deals={deals.data?.items.map((deal) => ({ id: deal.id, title: deal.title })) ?? []}
          dealId={presetDealId}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
    </div>
  );
}

export function ProposalDetailPage({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [linesOpen, setLinesOpen] = useState(false);
  const [confirm, setConfirm] = useState<"SEND" | "REVISE" | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const router = useRouter();

  const query = useQuery({
    queryKey: salesKeys.proposals.detail(id),
    queryFn: () => getProposal(id),
  });
  const deals = useQuery({
    queryKey: crmKeys.deals.list({ page: 1, pageSize: 100 }),
    queryFn: () => listDeals({ page: 1, pageSize: 100 }),
  });

  const updateMutation = useMutation({
    mutationFn: (body: { terms?: string }) => updateProposal(id, body),
    onSuccess: (proposal) => {
      queryClient.setQueryData(salesKeys.proposals.detail(id), proposal);
      queryClient.invalidateQueries({ queryKey: salesKeys.proposals.all });
      setEditing(false);
      pushToast({ title: "Draft saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const linesMutation = useMutation({
    mutationFn: (
      lines: Array<{ description: string; quantity: string; unitPrice: string; sortOrder: number }>
    ) => replaceProposalLineItems(id, lines),
    onSuccess: (proposal) => {
      queryClient.setQueryData(salesKeys.proposals.detail(id), proposal);
      setLinesOpen(false);
      pushToast({ title: "Line items replaced", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t update lines", description: queryErrorMessage(error), tone: "danger" }),
  });

  const sendMutation = useMutation({
    mutationFn: () => sendProposal(id),
    onSuccess: (proposal) => {
      queryClient.setQueryData(salesKeys.proposals.detail(id), proposal);
      queryClient.invalidateQueries({ queryKey: salesKeys.proposals.all });
      setConfirm(null);
      pushToast({ title: "Proposal sent", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Send failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const reviseMutation = useMutation({
    mutationFn: () => reviseProposal(id),
    onSuccess: (proposal) => {
      queryClient.invalidateQueries({ queryKey: salesKeys.proposals.all });
      setConfirm(null);
      pushToast({ title: "New draft version created", description: `v${proposal.version}`, tone: "success" });
      router.push(`/projects/proposals/${proposal.id}`);
    },
    onError: (error) => pushToast({ title: "Revise failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const transitionMutation = useMutation({
    mutationFn: (to: "VIEWED" | "REJECTED" | "EXPIRED") => transitionProposal(id, to),
    onSuccess: (proposal) => {
      queryClient.setQueryData(salesKeys.proposals.detail(id), proposal);
      queryClient.invalidateQueries({ queryKey: salesKeys.proposals.all });
      pushToast({ title: `Proposal ${enumLabel(proposal.status).toLowerCase()}`, tone: "success" });
    },
    onError: (error) => pushToast({ title: "Transition failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading proposal" />;
  if (query.isError && (isNotFoundError(query.error) || isForbiddenError(query.error) || isUnauthorizedError(query.error))) {
    return <ForbiddenState />;
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const proposal = query.data;
  const draft = isDraftProposal(proposal.status);
  const transitions = nextProposalTransitions(proposal.status);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Proposal"
        title={`Proposal v${proposal.version}`}
        actions={
          <Can permission="sales.manage">
            {draft ? (
              <Button variant="secondary" onClick={() => setEditing(true)}>
                Edit draft
              </Button>
            ) : null}
          </Can>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge tone={proposalTone[proposal.status]}>{enumLabel(proposal.status)}</StatusBadge>
        <p className="type-metadata text-steel">v{proposal.version}</p>
        {!draft ? <p className="type-helper text-steel">This version is immutable. Revise to edit.</p> : null}
      </div>

      <Can permission="sales.manage">
        <div className="flex flex-wrap gap-2">
          {draft ? (
            <Button onClick={() => setConfirm("SEND")} loading={sendMutation.isPending}>
              Send
            </Button>
          ) : null}
          {draft ? (
            <Button variant="secondary" onClick={() => setLinesOpen(true)}>
              Replace line items
            </Button>
          ) : null}
          {canReviseProposal(proposal.status) ? (
            <Button variant="secondary" onClick={() => setConfirm("REVISE")}>
              Revise
            </Button>
          ) : null}
          {transitions.includes("VIEWED") ? (
            <Button variant="secondary" onClick={() => transitionMutation.mutate("VIEWED")} loading={transitionMutation.isPending}>
              Mark viewed
            </Button>
          ) : null}
          {transitions.includes("REJECTED") ? (
            <Button variant="destructive" onClick={() => transitionMutation.mutate("REJECTED")} loading={transitionMutation.isPending}>
              Mark rejected
            </Button>
          ) : null}
          {transitions.includes("EXPIRED") ? (
            <Button variant="secondary" onClick={() => transitionMutation.mutate("EXPIRED")} loading={transitionMutation.isPending}>
              Mark expired
            </Button>
          ) : null}
        </div>
      </Can>
      {proposal.status === "SENT" || proposal.status === "VIEWED" ? (
        <p className="type-helper text-steel">
          Acceptance is `POST /portal/proposals/:id/accept` and is not offered on this internal screen.
        </p>
      ) : null}

      <Panel title="Client / deal context">
        <FactList
          items={[
            {
              label: "Deal",
              value: (
                <Link className="hover:underline" href={`/crm/deals/${proposal.dealId}`}>
                  {proposal.deal?.name ?? proposal.dealId}
                </Link>
              ),
            },
            { label: "Created by", value: proposal.createdBy ?? "—" },
          ]}
        />
      </Panel>

      <Panel title="Version information">
        <FactList
          items={[
            { label: "Version", value: `v${proposal.version}` },
            { label: "Terms", value: proposal.terms ?? "—" },
            { label: "Sent", value: formatTimestamp(proposal.sentAt) },
            { label: "Viewed", value: formatTimestamp(proposal.viewedAt) },
            { label: "Accepted", value: formatTimestamp(proposal.acceptedAt) },
            { label: "Rejected", value: formatTimestamp(proposal.rejectedAt) },
            { label: "Expires", value: formatTimestamp(proposal.expiresAt) },
          ]}
        />
      </Panel>

      <Panel title="Line items">
        {proposal.lineItems.length === 0 ? (
          <p className="type-helper text-steel">No line items on this version.</p>
        ) : (
          <Table caption="Proposal line items">
            <TableHead>
              <TableHeaderCell>Description</TableHeaderCell>
              <TableHeaderCell>Quantity</TableHeaderCell>
              <TableHeaderCell>Rate</TableHeaderCell>
            </TableHead>
            <TableBody>
              {proposal.lineItems.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell mono>{item.quantity ?? "—"}</TableCell>
                  <TableCell mono>{item.unitPrice ? formatInr(item.unitPrice) : "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        <p className="type-helper mt-3 text-steel">
          Amount and proposal totals are not stored on ProposalLineItem. This screen does not multiply quantity × rate.
        </p>
      </Panel>

      <Panel title="Totals">
        <p className="type-helper text-steel">Awaiting live data — no total field exists on the frozen Proposal model.</p>
      </Panel>

      <Panel kicker="Feed" title="Activity">
        <ActivityFeed dealId={proposal.dealId} />
      </Panel>

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit draft">
        <ProposalFields
          proposal={proposal}
          deals={deals.data?.items.map((deal) => ({ id: deal.id, title: deal.title })) ?? []}
          pending={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateMutation.mutate({ terms: values.terms })}
        />
      </Drawer>
      <Drawer open={linesOpen} onClose={() => setLinesOpen(false)} title="Replace line items">
        <LineItemsEditor
          items={proposal.lineItems}
          pending={linesMutation.isPending}
          onCancel={() => setLinesOpen(false)}
          onSubmit={(lines) => linesMutation.mutate(lines)}
        />
      </Drawer>
      <ConfirmationDialog
        open={confirm === "SEND"}
        onClose={() => setConfirm(null)}
        onConfirm={() => sendMutation.mutate()}
        title="Send this proposal?"
        description="Send freezes this version. Further edits require Revise, which creates a new draft row."
        confirmLabel="Send proposal"
        pending={sendMutation.isPending}
      />
      <ConfirmationDialog
        open={confirm === "REVISE"}
        onClose={() => setConfirm(null)}
        onConfirm={() => reviseMutation.mutate()}
        title="Create a new draft version?"
        description="The current row stays frozen. The backend copies line items onto version+1."
        confirmLabel="Revise"
        pending={reviseMutation.isPending}
      />
    </div>
  );
}
