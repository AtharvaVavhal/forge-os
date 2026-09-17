"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { ForbiddenState } from "@/features/auth/components/forbidden-state";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";
import { archiveCompany, getCompany, updateCompany } from "../api/crm-api";
import { crmKeys } from "../api/query-keys";
import { formatTimestamp } from "../format";
import { ActivityFeed } from "./activity-feed";
import { CompanyFields } from "./crm-forms";
import { FactList, PageHeader } from "./page-chrome";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { NotesPanel } from "@/features/shared/components/notes-panel";
import { DocumentsPanel } from "@/features/shared/components/documents-panel";

export function CompanyDetailPage({ id }: { id: string }) {
  const [editing, setEditing] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const query = useQuery({
    queryKey: crmKeys.companies.detail(id),
    queryFn: () => getCompany(id),
  });

  const updateMutation = useMutation({
    mutationFn: (body: Parameters<typeof updateCompany>[1]) => updateCompany(id, body),
    onSuccess: (company) => {
      queryClient.setQueryData(crmKeys.companies.detail(id), company);
      queryClient.invalidateQueries({ queryKey: crmKeys.companies.all });
      setEditing(false);
      pushToast({ title: "Company saved", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t save", description: queryErrorMessage(error), tone: "danger" }),
  });

  const archiveMutation = useMutation({
    mutationFn: () => archiveCompany(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: crmKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: crmKeys.companies.detail(id) });
      setArchiveOpen(false);
      pushToast({ title: "Company archived", tone: "success" });
    },
    onError: (error) => pushToast({ title: "Couldn’t archive", description: queryErrorMessage(error), tone: "danger" }),
  });

  if (query.isPending) return <LoadingState label="Loading company" />;
  if (query.isError && (isNotFoundError(query.error) || isForbiddenError(query.error) || isUnauthorizedError(query.error))) {
    return <ForbiddenState />;
  }
  if (query.isError) return <ErrorState>{queryErrorMessage(query.error)}</ErrorState>;

  const company = query.data;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        kicker="Company"
        title={company.name}
        description={company.archivedAt ? "This company is archived." : undefined}
        actions={
          <Can permission="crm.manage">
            <Button variant="secondary" onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button variant="destructive" onClick={() => setArchiveOpen(true)}>
              Archive
            </Button>
          </Can>
        }
      />

      <Panel title="Primary information">
        <FactList
          items={[
            { label: "GSTIN", value: company.gstin ?? "—" },
            { label: "Billing state", value: company.billingState ?? "—" },
            { label: "Billing address", value: company.billingAddress ?? "—" },
            { label: "Tags", value: company.tags.length ? company.tags.join(", ") : "—" },
            { label: "Created", value: formatTimestamp(company.createdAt) },
            { label: "Updated", value: formatTimestamp(company.updatedAt) },
          ]}
        />
      </Panel>

      <Panel
        kicker="Related"
        title="Contacts, deals, and projects"
      >
        <p className="type-helper text-steel">
          Nested relationship lists need documented collection filters (`companyId`) that are not
          named on those list endpoints. Open the canonical lists instead.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link className="type-body font-semibold text-ember-deep hover:underline" href="/crm/contacts">
            Contacts
          </Link>
          <Link className="type-body font-semibold text-ember-deep hover:underline" href="/crm/deals">
            Deals
          </Link>
          <Link className="type-body font-semibold text-ember-deep hover:underline" href="/projects">
            Projects
          </Link>
        </div>
      </Panel>

      <Panel kicker="Feed" title="Activity">
        <ActivityFeed companyId={company.id} />
      </Panel>

      <NotesPanel parent={{ companyId: company.id }} />
      <DocumentsPanel parent={{ companyId: company.id }} />

      <Drawer open={editing} onClose={() => setEditing(false)} title="Edit company">
        <CompanyFields
          company={company}
          pending={updateMutation.isPending}
          onCancel={() => setEditing(false)}
          onSubmit={(values) => updateMutation.mutate(values)}
        />
      </Drawer>

      <ConfirmationDialog
        open={archiveOpen}
        onClose={() => setArchiveOpen(false)}
        onConfirm={() => archiveMutation.mutate()}
        title="Archive this company?"
        description="The company will be soft-archived. Related records are not deleted."
        confirmLabel="Archive"
        destructive
        pending={archiveMutation.isPending}
      />
    </div>
  );
}
