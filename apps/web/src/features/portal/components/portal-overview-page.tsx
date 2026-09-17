"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { PortalStatusBadge } from "./portal-status-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  listPortalDocuments,
  listPortalInvoices,
  listPortalProjects,
  listPortalProposals,
} from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import { usePortalClientUser } from "../session/portal-session-context";
import { MoneyText } from "./money-text";

export function PortalOverviewPage() {
  const clientUser = usePortalClientUser();

  const projectsQuery = useQuery({
    queryKey: portalKeys.projects.list({ limit: 5 }),
    queryFn: () => listPortalProjects({ limit: 5 }),
  });

  const proposalsQuery = useQuery({
    queryKey: portalKeys.proposals.list({ limit: 5 }),
    queryFn: () => listPortalProposals({ limit: 5 }),
  });

  const invoicesQuery = useQuery({
    queryKey: portalKeys.invoices.list({ limit: 5 }),
    queryFn: () => listPortalInvoices({ limit: 5 }),
  });

  const documentsQuery = useQuery({
    queryKey: portalKeys.documents.list({ limit: 5 }),
    queryFn: () => listPortalDocuments({ limit: 5 }),
  });

  return (
    <div className="space-y-8" data-testid="portal-overview-page">
      {/* Header */}
      <div className="border-b border-[var(--forge-border,#e5dfd5)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
          Welcome{clientUser.company?.name ? `, ${clientUser.company.name}` : ""}
        </h1>
        <p className="text-sm text-[var(--forge-ink-muted,#78736a)] mt-1">
          Review your active projects, proposals, invoices, and shared documents.
        </p>
      </div>

      {/* Grid of Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Projects Section */}
        <Card className="p-6 space-y-4 border-[var(--forge-border,#e5dfd5)] bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--forge-ink,#1a1918)]">
              Projects
            </h2>
            <Link
              href="/portal/projects"
              className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>

          {projectsQuery.isLoading && (
            <div className="space-y-3" data-testid="portal-projects-loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {projectsQuery.isError && (
            <Alert variant="danger" title="Service Unavailable" data-testid="portal-projects-error">
              Projects service is currently unavailable.
            </Alert>
          )}

          {projectsQuery.isSuccess && projectsQuery.data.items.length === 0 && (
            <div className="text-center py-6 text-sm text-[var(--forge-ink-muted,#78736a)]" data-testid="portal-projects-empty">
              No projects found for your company.
            </div>
          )}

          {projectsQuery.isSuccess && projectsQuery.data.items.length > 0 && (
            <div className="divide-y divide-[var(--forge-border-subtle,#f0eae0)]">
              {projectsQuery.data.items.map((project) => (
                <div key={project.id} className="py-3 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/portal/projects/${project.id}`}
                      className="font-medium text-sm text-[var(--forge-ink,#1a1918)] hover:underline"
                    >
                      {project.name}
                    </Link>
                    <div className="text-xs text-[var(--forge-ink-muted,#78736a)] mt-0.5">
                      Phase: {project.phase}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <PortalStatusBadge status={project.status} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Proposals Section */}
        <Card className="p-6 space-y-4 border-[var(--forge-border,#e5dfd5)] bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--forge-ink,#1a1918)]">
              Proposals
            </h2>
            <Link
              href="/portal/proposals"
              className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>

          {proposalsQuery.isLoading && (
            <div className="space-y-3" data-testid="portal-proposals-loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {proposalsQuery.isError && (
            <Alert variant="danger" title="Service Unavailable" data-testid="portal-proposals-error">
              Proposals service is currently unavailable.
            </Alert>
          )}

          {proposalsQuery.isSuccess && proposalsQuery.data.items.length === 0 && (
            <div className="text-center py-6 text-sm text-[var(--forge-ink-muted,#78736a)]" data-testid="portal-proposals-empty">
              No proposals found.
            </div>
          )}

          {proposalsQuery.isSuccess && proposalsQuery.data.items.length > 0 && (
            <div className="divide-y divide-[var(--forge-border-subtle,#f0eae0)]">
              {proposalsQuery.data.items.map((proposal) => (
                <div key={proposal.id} className="py-3 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/portal/proposals/${proposal.id}`}
                      className="font-medium text-sm text-[var(--forge-ink,#1a1918)] hover:underline"
                    >
                      Proposal v{proposal.version}
                    </Link>
                    {proposal.expiresAt && (
                      <div className="text-xs text-[var(--forge-ink-muted,#78736a)] mt-0.5">
                        Expires: {new Date(proposal.expiresAt).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <PortalStatusBadge status={proposal.status} />
                    {(proposal.status === "SENT" || proposal.status === "VIEWED") && (
                      <Link href={`/portal/proposals/${proposal.id}`}>
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2">
                          Review
                        </Button>
                      </Link>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Invoices Section */}
        <Card className="p-6 space-y-4 border-[var(--forge-border,#e5dfd5)] bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--forge-ink,#1a1918)]">
              Invoices
            </h2>
            <Link
              href="/portal/invoices"
              className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>

          {invoicesQuery.isLoading && (
            <div className="space-y-3" data-testid="portal-invoices-loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {invoicesQuery.isError && (
            <Alert variant="danger" title="Service Unavailable" data-testid="portal-invoices-error">
              Invoices service is currently unavailable.
            </Alert>
          )}

          {invoicesQuery.isSuccess && invoicesQuery.data.items.length === 0 && (
            <div className="text-center py-6 text-sm text-[var(--forge-ink-muted,#78736a)]" data-testid="portal-invoices-empty">
              No invoices found.
            </div>
          )}

          {invoicesQuery.isSuccess && invoicesQuery.data.items.length > 0 && (
            <div className="divide-y divide-[var(--forge-border-subtle,#f0eae0)]">
              {invoicesQuery.data.items.map((invoice) => (
                <div key={invoice.id} className="py-3 flex items-center justify-between">
                  <div>
                    <Link
                      href={`/portal/invoices/${invoice.id}`}
                      className="font-medium text-sm text-[var(--forge-ink,#1a1918)] hover:underline font-mono"
                    >
                      {invoice.invoiceNumber || "Invoice"}
                    </Link>
                    <div className="text-xs text-[var(--forge-ink-muted,#78736a)] mt-0.5">
                      Amount: <MoneyText value={invoice.amount} />
                      {invoice.pendingAmount && invoice.pendingAmount !== "0" && (
                        <span> &bull; Due: <MoneyText value={invoice.pendingAmount} /></span>
                      )}
                    </div>
                  </div>
                  <PortalStatusBadge status={invoice.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Documents Section */}
        <Card className="p-6 space-y-4 border-[var(--forge-border,#e5dfd5)] bg-white">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--forge-ink,#1a1918)]">
              Documents
            </h2>
            <Link
              href="/portal/documents"
              className="text-xs font-medium text-[var(--forge-ink,#1a1918)] hover:underline"
            >
              View all &rarr;
            </Link>
          </div>

          {documentsQuery.isLoading && (
            <div className="space-y-3" data-testid="portal-documents-loading">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          )}

          {documentsQuery.isError && (
            <Alert variant="danger" title="Service Unavailable" data-testid="portal-documents-error">
              Documents service is currently unavailable.
            </Alert>
          )}

          {documentsQuery.isSuccess && documentsQuery.data.items.length === 0 && (
            <div className="text-center py-6 text-sm text-[var(--forge-ink-muted,#78736a)]" data-testid="portal-documents-empty">
              No documents shared with your company yet.
            </div>
          )}

          {documentsQuery.isSuccess && documentsQuery.data.items.length > 0 && (
            <div className="divide-y divide-[var(--forge-border-subtle,#f0eae0)]">
              {documentsQuery.data.items.map((doc) => (
                <div key={doc.id} className="py-3 flex items-center justify-between">
                  <div className="min-w-0 pr-4">
                    <div className="font-medium text-sm text-[var(--forge-ink,#1a1918)] truncate">
                      {doc.title}
                    </div>
                    <div className="text-xs text-[var(--forge-ink-muted,#78736a)] mt-0.5 truncate">
                      {doc.fileName} &bull; {new Date(doc.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                  <Link href="/portal/documents">
                    <Button size="sm" variant="outline" className="text-xs h-7 px-2">
                      View
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
