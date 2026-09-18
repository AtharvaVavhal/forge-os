"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/data-display/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";
import { Can } from "@/features/auth/authorization/can";
import { WorkspaceIdentity } from "@/app/(workspace)/dashboard/workspace-identity";
import { isForbiddenError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { formatInr } from "@/lib/money/format-inr";
import { getForgeFundBalance, listForgeFundEntries, listProjects } from "@/features/crm/api/crm-api";
import { crmKeys } from "@/features/crm/api/query-keys";
import { enumLabel, formatDate } from "@/features/crm/format";
import type { ProjectStatus } from "@/features/crm/api/types";
import { ErrorState, LoadingState, TableLoadingState } from "@/components/data-display/data-states";
import { getOwnKycProfile } from "@/features/onboarding/api/kyc-api";
import { onboardingQueryKeys } from "@/features/onboarding/api/query-keys";
import { KycStatusSummary } from "@/features/onboarding/components/kyc-status-summary";

const projectTone: Record<ProjectStatus, StatusTone> = {
  ACTIVE: "success",
  ON_HOLD: "warning",
  AT_RISK: "danger",
  COMPLETED: "neutral",
  CANCELLED: "neutral",
};

function Unavailable({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="font-display text-[length:var(--text-kpi-size)] leading-[var(--text-kpi-leading)] text-steel/45">
        —
      </p>
      <p className="type-helper text-steel">{title}</p>
      <p className="type-helper text-steel/80">{description}</p>
    </div>
  );
}

function KpiSlot({
  label,
  description,
}: {
  label: string;
  description: string;
}) {
  return (
    <Card padding="compact" aria-label={label}>
      <p className="type-mono-label text-steel">{label}</p>
      <Unavailable title="Awaiting live data" description={description} />
    </Card>
  );
}

export function DashboardPage() {
  return (
    <div className="flex flex-col gap-[var(--space-dashboard-gap)]">
      <header className="flex flex-col gap-2">
        <p className="type-mono-label text-steel">Workspace</p>
        <h1 className="type-page-title text-ink">Dashboard</h1>
        <p className="type-body max-w-2xl text-ink/70">
          Widgets below use documented list/ledger endpoints only. There is no dashboard aggregate
          API in the frozen contract, so KPI totals and the revenue chart stay unavailable.
        </p>
      </header>

      <WorkspaceIdentity />

      <Can role="TEAM_MEMBER">
        <KycStatusWidget />
      </Can>

      <section aria-label="Key indicators" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiSlot
          label="Open pipeline"
          description="No aggregate endpoint. A paginated deal list cannot be summed as a KPI."
        />
        <KpiSlot
          label="Overdue invoices"
          description="GET /invoices has no documented status filter."
        />
        <KpiSlot
          label="Active projects"
          description="GET /projects has no documented status=ACTIVE filter."
        />
        <KpiSlot
          label="Open tasks"
          description="Tasks are nested under /projects/:id/tasks, not a dashboard aggregate."
        />
      </section>

      <Card>
        <CardHeader
          kicker="Revenue"
          title="Business chart"
          description="No payment-dated revenue series endpoint is specified."
        />
        <div
          className="flex h-48 items-center justify-center rounded-lg border border-dashed border-steel/20 bg-surface-sunken"
          role="img"
          aria-label="Revenue chart unavailable"
        >
          <p className="type-helper max-w-sm text-center text-steel">
            Awaiting live series. Fake history is not rendered.
          </p>
        </div>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader kicker="Queue" title="Needs attention" />
          <EmptyState
            title="No queue contract"
            description="Overdue invoices, proposals awaiting response, and at-risk projects need documented filtered list APIs before this widget can load records."
            className="py-10"
          />
        </Card>
        <Card>
          <CardHeader kicker="Feed" title="Recent activity" />
          <EmptyState
            title="Parent required"
            description="GET /activities requires exactly one of companyId, contactId, dealId, or projectId. A global feed is not specified."
            className="py-10"
          />
        </Card>
      </div>

      <Can permission="projects.read">
        <ProjectsWidget />
      </Can>

      <Can permission="forge_fund.read">
        <ForgeFundWidget />
      </Can>
    </div>
  );
}

/**
 * TEAM_MEMBER-only — reads the same GET /team/kyc used by onboarding, so
 * once onboardedAt is true (required just to reach /dashboard) and
 * /onboarding becomes gate-closed, this is the only place status is visible.
 */
function KycStatusWidget() {
  const kyc = useQuery({
    queryKey: onboardingQueryKeys.kyc(),
    queryFn: getOwnKycProfile,
  });

  return (
    <Card aria-label="KYC and verification status">
      <CardHeader
        kicker="Verification"
        title="KYC & Verification"
        action={
          <Link
            href="/settings/profile?tab=verification"
            className="type-body font-semibold text-ember-deep hover:underline"
          >
            View verification
          </Link>
        }
      />
      {kyc.isPending ? (
        <LoadingState label="Loading verification status" />
      ) : kyc.isError ? (
        <ErrorState>{queryErrorMessage(kyc.error)}</ErrorState>
      ) : (
        <KycStatusSummary profile={kyc.data} />
      )}
    </Card>
  );
}

function ProjectsWidget() {
  const query = useQuery({
    queryKey: crmKeys.projects.list({ page: 1, pageSize: 10 }),
    queryFn: () => listProjects({ page: 1, pageSize: 10 }),
  });

  return (
    <Card padding="none">
      <div className="p-[var(--space-card-padding-comfortable)] pb-0">
        <CardHeader
          kicker="Delivery"
          title="Projects"
          description="GET /projects — unfiltered. Status is shown as returned."
          action={
            <Link href="/projects" className="type-body font-semibold text-ember-deep hover:underline">
              Open projects
            </Link>
          }
        />
      </div>
      {query.isPending ? (
        <div className="p-5">
          <TableLoadingState rows={4} />
        </div>
      ) : query.isError && isNotFoundError(query.error) ? (
        <EmptyState
          title="Projects API unavailable"
          description="The projects module is not implemented on this API yet."
          className="py-10"
        />
      ) : query.isError && isForbiddenError(query.error) ? (
        <div className="p-5">
          <ErrorState title="Permission required">You don’t have projects.read.</ErrorState>
        </div>
      ) : query.isError ? (
        <div className="p-5">
          <ErrorState>{queryErrorMessage(query.error)}</ErrorState>
        </div>
      ) : query.data.items.length === 0 ? (
        <EmptyState
          title="No projects"
          description="When projects exist they will list here from GET /projects."
          className="py-10"
        />
      ) : (
        <Table caption="Projects">
          <TableHead>
            <TableHeaderCell>Project</TableHeaderCell>
            <TableHeaderCell>Status</TableHeaderCell>
            <TableHeaderCell>Phase</TableHeaderCell>
            <TableHeaderCell>Deadline</TableHeaderCell>
          </TableHead>
          <TableBody>
            {query.data.items.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link href={`/projects`} className="font-semibold hover:underline">
                    {project.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <StatusBadge tone={projectTone[project.status]}>{enumLabel(project.status)}</StatusBadge>
                </TableCell>
                <TableCell>{enumLabel(project.phase)}</TableCell>
                <TableCell mono>{formatDate(project.deadline)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  );
}

function ForgeFundWidget() {
  const balance = useQuery({
    queryKey: crmKeys.forgeFund.balance,
    queryFn: getForgeFundBalance,
  });
  const entries = useQuery({
    queryKey: crmKeys.forgeFund.entries({ page: 1, pageSize: 5, sort: "createdAt:desc" }),
    queryFn: () => listForgeFundEntries({ page: 1, pageSize: 5, sort: "createdAt:desc" }),
  });

  const unavailable =
    (balance.isError && isNotFoundError(balance.error)) ||
    (entries.isError && isNotFoundError(entries.error));

  return (
    <Card>
      <CardHeader
        kicker="Treasury"
        title="Forge Fund"
        description="ForgeFundEntry ledger only. No payout entity."
        action={
          <Link href="/finance/forge-fund" className="type-body font-semibold text-ember-deep hover:underline">
            Open ledger
          </Link>
        }
      />
      {unavailable ? (
        <EmptyState
          title="Forge Fund API unavailable"
          description="GET /forge-fund/balance and GET /forge-fund-entries are specified but not implemented on this API yet."
          className="py-8"
        />
      ) : (
        <>
          <p className="type-mono-label text-steel">Balance</p>
          {balance.isPending ? (
            <LoadingState label="Loading balance" />
          ) : balance.isError ? (
            <ErrorState>{queryErrorMessage(balance.error)}</ErrorState>
          ) : (
            <p className="font-display mt-1 text-[length:var(--text-kpi-size)] leading-[var(--text-kpi-leading)] text-ink">
              {balance.data ? formatInr(balance.data) : "—"}
            </p>
          )}
          <div className="mt-6">
            {entries.isPending ? (
              <TableLoadingState rows={3} />
            ) : entries.isError ? (
              <ErrorState>{queryErrorMessage(entries.error)}</ErrorState>
            ) : entries.data.items.length === 0 ? (
              <EmptyState title="No ledger rows" description="Entries appear when finance records them." className="py-8" />
            ) : (
              <Table caption="Forge Fund entries">
                <TableHead>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Amount</TableHeaderCell>
                  <TableHeaderCell>Reason</TableHeaderCell>
                </TableHead>
                <TableBody>
                  {entries.data.items.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>{enumLabel(entry.type)}</TableCell>
                      <TableCell mono>{entry.amount ? formatInr(entry.amount) : "—"}</TableCell>
                      <TableCell>{entry.reason}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
