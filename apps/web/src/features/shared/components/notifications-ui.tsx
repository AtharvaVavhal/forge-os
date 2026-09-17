"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/feedback/status-badge";
import { useToast } from "@/components/overlays/toast";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { queryErrorMessage } from "@/lib/api/query-error";
import { SharedQueryState } from "./shared-query-state";
import { listNotifications, markNotificationRead } from "../api/shared-api";
import { sharedKeys } from "../api/query-keys";

export function NotificationsPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const list = useQuery({
    queryKey: sharedKeys.notifications.list({ limit: 50 }),
    queryFn: () => listNotifications({ limit: 50 }),
  });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.notifications.all });
      pushToast({ title: "Marked read", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t mark read", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Workspace"
        title="Notifications"
        description="GET /notifications for the signed-in recipient. Unread counts are not fabricated — only readAt from the API."
      />
      <SharedQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No notifications"
        emptyDescription="In-app notifications appear here when the backend creates them. This is not a fake empty inbox."
        unavailableTitle="Service is not currently available."
      >
        <ul className="flex flex-col gap-3">
          {list.data?.items.map((item) => (
            <li key={item.id} className="border-t border-steel/15 pt-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="type-body font-semibold text-ink">{item.type}</p>
                  <p className="type-metadata mt-1 text-steel">
                    {formatTimestamp(item.createdAt)}
                    {item.channel ? ` · ${enumLabel(item.channel)}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={item.readAt ? "neutral" : "info"}>
                    {item.readAt ? "Read" : "Unread"}
                  </StatusBadge>
                  {!item.readAt ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      loading={readMutation.isPending}
                      onClick={() => readMutation.mutate(item.id)}
                    >
                      Mark read
                    </Button>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </SharedQueryState>
      <p className="type-helper text-steel">
        Payload navigation routes are not fully specified per notification type — this list does not invent deep links.
      </p>
    </div>
  );
}

export function NotificationsPopover() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const list = useQuery({
    queryKey: sharedKeys.notifications.list({ limit: 8 }),
    queryFn: () => listNotifications({ limit: 8 }),
  });

  const readMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.notifications.all });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t mark read", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="type-mono-label text-steel">Notifications</p>
        <Link href="/notifications" className="type-helper font-semibold text-ink hover:underline">
          View all
        </Link>
      </div>
      <SharedQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No notifications"
        emptyDescription="Nothing from the API yet. This is not a fabricated inbox."
        unavailableTitle="Service is not currently available."
      >
        <ul className="flex max-h-80 flex-col gap-3 overflow-y-auto">
          {list.data?.items.map((item) => (
            <li key={item.id} className="border-t border-steel/15 pt-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="type-body truncate text-ink">{item.type}</p>
                  <p className="type-metadata text-steel">{formatTimestamp(item.createdAt)}</p>
                </div>
                {!item.readAt ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={readMutation.isPending}
                    onClick={() => readMutation.mutate(item.id)}
                  >
                    Read
                  </Button>
                ) : (
                  <StatusBadge tone="neutral">Read</StatusBadge>
                )}
              </div>
            </li>
          ))}
        </ul>
      </SharedQueryState>
    </div>
  );
}
