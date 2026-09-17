"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Drawer } from "@/components/overlays/drawer";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { FormActions } from "@/features/crm/components/page-chrome";
import { formatTimestamp } from "@/features/crm/format";
import { createActivity, listActivities } from "../api/shared-api";
import { sharedKeys } from "../api/query-keys";
import { queryErrorMessage } from "@/lib/api/query-error";
import { SharedQueryState } from "./shared-query-state";
import { activityWritePermission, type ActivityParent } from "../api/parent";
import { activityFormSchema } from "../schemas/activity-schema";

export function ActivityFeed({
  companyId,
  contactId,
  dealId,
  projectId,
}: ActivityParent) {
  const [createOpen, setCreateOpen] = useState(false);
  const write = activityWritePermission({ companyId, contactId, dealId, projectId });
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const filters = { companyId, contactId, dealId, projectId, limit: 25 };

  const query = useQuery({
    queryKey: sharedKeys.activities.list(filters),
    queryFn: () => listActivities({ companyId, contactId, dealId, projectId }, { limit: 25 }),
  });

  const createMutation = useMutation({
    mutationFn: (body: { type: string; summary: string; nextFollowUpAt?: string }) =>
      createActivity({
        type: body.type,
        summary: body.summary,
        companyId,
        contactId,
        dealId,
        projectId,
        nextFollowUpAt: dealId ? body.nextFollowUpAt : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.activities.all });
      setCreateOpen(false);
      pushToast({ title: "Activity logged", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t log activity", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Can permission={write}>
          <Button onClick={() => setCreateOpen(true)}>Log activity</Button>
        </Can>
      </div>
      <SharedQueryState
        isPending={query.isPending}
        isError={query.isError}
        error={query.error}
        isEmpty={query.isSuccess && query.data.items.length === 0}
        emptyTitle="No activity yet"
        emptyDescription="Activity attached to this record will appear here."
        unavailableTitle="Service is not currently available."
      >
        <ol className="flex flex-col gap-4">
          {query.data?.items.map((item) => (
            <li key={item.id} className="border-t border-steel/15 pt-3">
              <p className="type-mono-label text-steel">{item.type}</p>
              <p className="type-body mt-1 text-ink">{item.summary}</p>
              <p className="type-metadata mt-1 text-steel">
                {formatTimestamp(item.occurredAt)}
                {item.createdBy ? ` · ${item.createdBy}` : ""}
              </p>
            </li>
          ))}
        </ol>
      </SharedQueryState>
      <Drawer open={createOpen} onClose={() => setCreateOpen(false)} title="Log activity">
        <ActivityFields
          dealFollowUp={Boolean(dealId)}
          pending={createMutation.isPending}
          onCancel={() => setCreateOpen(false)}
          onSubmit={(values) => createMutation.mutate(values)}
        />
      </Drawer>
    </div>
  );
}

function ActivityFields({
  dealFollowUp,
  pending,
  onCancel,
  onSubmit,
}: {
  dealFollowUp: boolean;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { type: string; summary: string; nextFollowUpAt?: string }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = activityFormSchema.safeParse({
          type: form.get("type"),
          summary: form.get("summary"),
          nextFollowUpAt: String(form.get("nextFollowUpAt") ?? "") || undefined,
        });
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message);
          return;
        }
        setError(undefined);
        onSubmit(parsed.data);
      }}
    >
      {error ? (
        <p className="font-display text-[length:var(--text-error-size)] text-ember-deep" role="alert">
          {error}
        </p>
      ) : null}
      <Field id="activity-type" label="Type" required hint="Free-text type as stored on Activity.type.">
        <Input id="activity-type" name="type" />
      </Field>
      <Field id="activity-summary" label="Summary" required>
        <Textarea id="activity-summary" name="summary" />
      </Field>
      {dealFollowUp ? (
        <Field id="activity-follow-up" label="Next follow-up" hint="Optional. Sent only when the parent is a deal.">
          <Input id="activity-follow-up" name="nextFollowUpAt" type="datetime-local" />
        </Field>
      ) : null}
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Log activity" />
    </form>
  );
}
