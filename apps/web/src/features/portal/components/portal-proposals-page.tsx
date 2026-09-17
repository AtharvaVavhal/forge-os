"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listPortalProposals } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";

export function PortalProposalsPage() {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.proposals.list(),
    queryFn: () => listPortalProposals(),
  });

  return (
    <div className="space-y-6" data-testid="portal-proposals-page">
      <div className="border-b border-[var(--forge-border,#e5dfd5)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
          Proposals
        </h1>
        <p className="text-sm text-[var(--forge-ink-muted,#78736a)] mt-1">
          Review and accept proposals prepared for your company.
        </p>
      </div>

      {isLoading && (
        <Card className="p-6 space-y-3 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-proposals-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Card>
      )}

      {isError && (
        <Alert variant="danger" title="Service Unavailable" data-testid="portal-proposals-error">
          {(error as Error)?.message || "Proposals service is currently unavailable."}
        </Alert>
      )}

      {data && data.items.length === 0 && (
        <Card className="p-12 text-center bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-proposals-empty">
          <p className="text-sm text-[var(--forge-ink-muted,#78736a)]">
            No proposals have been shared with your company yet.
          </p>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden bg-white border-[var(--forge-border,#e5dfd5)]">
          <Table caption="Proposals">
            <TableHead>
              <TableHeaderCell>Proposal</TableHeaderCell>
              <TableHeaderCell>Status</TableHeaderCell>
              <TableHeaderCell>Sent Date</TableHeaderCell>
              <TableHeaderCell>Expires</TableHeaderCell>
              <TableHeaderCell className="text-right">Action</TableHeaderCell>
            </TableHead>
            <TableBody>
              {data.items.map((proposal) => (
                <TableRow key={proposal.id} data-testid={`portal-proposal-row-${proposal.id}`}>
                  <TableCell className="font-medium">
                    <Link
                      href={`/portal/proposals/${proposal.id}`}
                      className="text-[var(--forge-ink,#1a1918)] hover:underline font-mono text-sm"
                    >
                      Proposal v{proposal.version}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <PortalStatusBadge status={proposal.status} />
                  </TableCell>
                  <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                    {proposal.sentAt ? new Date(proposal.sentAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                    {proposal.expiresAt ? new Date(proposal.expiresAt).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/portal/proposals/${proposal.id}`}
                      className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
                    >
                      {proposal.status === "SENT" || proposal.status === "VIEWED" ? "Review & Accept" : "View"} &rarr;
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
