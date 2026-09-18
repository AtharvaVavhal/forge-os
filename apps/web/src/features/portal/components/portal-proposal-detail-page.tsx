"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Breadcrumb } from "@/components/data-display/breadcrumb";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { acceptPortalProposal, getPortalProposal } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import { queryErrorMessage } from "@/lib/api/query-error";
import { MoneyText } from "./money-text";

export function PortalProposalDetailPage({ id }: { id: string }) {
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data: proposal, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.proposals.detail(id),
    queryFn: () => getPortalProposal(id),
  });

  const acceptMutation = useMutation({
    mutationFn: () => acceptPortalProposal(id),
    onSuccess: (updated) => {
      setActionError(null);
      setConfirmOpen(false);
      if (updated) {
        queryClient.setQueryData(portalKeys.proposals.detail(id), updated);
      }
      queryClient.invalidateQueries({ queryKey: portalKeys.proposals.list() });
    },
    onError: (err: Error) => {
      setActionError(err.message || "Failed to accept proposal. Please try again.");
    },
  });

  const canAccept = proposal?.status === "SENT" || proposal?.status === "VIEWED";

  return (
    <div className="space-y-6 max-w-4xl mx-auto" data-testid="portal-proposal-detail-page">
      <Breadcrumb
        items={[
          { label: "Proposals", href: "/portal/proposals" },
          { label: proposal ? `Proposal v${proposal.version}` : "Proposal Detail" },
        ]}
      />

      {isLoading && (
        <Card className="p-8 space-y-4 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-proposal-loading">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-4 w-1/4" />
          <Skeleton className="h-48 w-full" />
        </Card>
      )}

      {isError && (
        <div data-testid="portal-proposal-error">
          <Alert tone="danger" title="Unavailable">
            {queryErrorMessage(error)}
          </Alert>
        </div>
      )}

      {proposal && (
        <div className="space-y-6">
          {actionError && (
            <div data-testid="portal-proposal-action-error">
              <Alert tone="danger" title="Action Failed">
                {actionError}
              </Alert>
            </div>
          )}

          {/* Proposal Header */}
          <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)] font-mono">
                    Proposal v{proposal.version}
                  </h1>
                  <PortalStatusBadge status={proposal.status} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--forge-ink-muted,#78736a)] mt-2">
                  {proposal.sentAt && (
                    <span>Sent: {new Date(proposal.sentAt).toLocaleDateString()}</span>
                  )}
                  {proposal.expiresAt && (
                    <span>Expires: {new Date(proposal.expiresAt).toLocaleDateString()}</span>
                  )}
                  {proposal.acceptedAt && (
                    <span className="text-emerald-700 font-medium">
                      Accepted: {new Date(proposal.acceptedAt).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              {/* Accept Action */}
              <div>
                {canAccept && (
                  <Button
                    variant="primary"
                    onClick={() => setConfirmOpen(true)}
                    data-testid="portal-accept-proposal-button"
                  >
                    Accept Proposal
                  </Button>
                )}

                {proposal.status === "ACCEPTED" && (
                  <div
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-50 text-emerald-800 text-xs font-medium border border-emerald-200"
                    data-testid="portal-proposal-accepted-badge"
                  >
                    Proposal Accepted
                  </div>
                )}

                {proposal.status === "EXPIRED" && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-amber-50 text-amber-800 text-xs font-medium border border-amber-200">
                    Proposal Expired
                  </div>
                )}

                {proposal.status === "REJECTED" && (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-red-50 text-red-800 text-xs font-medium border border-red-200">
                    Proposal Declined
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Terms / Scope Section */}
          {proposal.terms && (
            <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-2">
              <h2 className="text-base font-semibold text-[var(--forge-ink,#1a1918)]">
                Terms &amp; Scope of Work
              </h2>
              <div className="text-sm text-[var(--forge-ink,#1a1918)] whitespace-pre-wrap leading-relaxed">
                {proposal.terms}
              </div>
            </Card>
          )}

          {/* Line Items Table */}
          <Card className="p-6 bg-white border-[var(--forge-border,#e5dfd5)] space-y-4">
            <h2 className="text-base font-semibold text-[var(--forge-ink,#1a1918)]">
              Line Items
            </h2>

            {proposal.lineItems.length === 0 ? (
              <p className="text-sm text-[var(--forge-ink-muted,#78736a)] py-4 text-center">
                No line items specified.
              </p>
            ) : (
              <Table caption="Proposal line items">
                <TableHead>
                  <TableHeaderCell>Description</TableHeaderCell>
                  <TableHeaderCell className="text-right">Quantity</TableHeaderCell>
                  <TableHeaderCell className="text-right">Unit Price</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {proposal.lineItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium text-sm">
                        {item.description}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {item.quantity ?? "1"}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        <MoneyText value={item.unitPrice} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        </div>
      )}

      {/* Acceptance Confirmation Dialog */}
      <ConfirmationDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => acceptMutation.mutate()}
        title="Accept Proposal"
        description={`Are you sure you want to accept Proposal v${proposal?.version}? This action confirms your agreement to the terms and scope.`}
        confirmLabel="Yes, Accept Proposal"
        pending={acceptMutation.isPending}
      />
    </div>
  );
}
