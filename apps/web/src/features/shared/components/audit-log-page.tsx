"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { PageHeader } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { SharedQueryState } from "./shared-query-state";
import { listAuditLogs } from "../api/shared-api";
import { sharedKeys } from "../api/query-keys";

/**
 * Read-only AuditLog list. Document 5 forbids UPDATE/DELETE for the app role.
 * Filters are unnamed on GET /audit-logs — only cursor/limit are sent.
 */
export function AuditLogPage() {
  const list = useQuery({
    queryKey: sharedKeys.auditLogs.list({ limit: 50 }),
    queryFn: () => listAuditLogs({ limit: 50 }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        kicker="Settings"
        title="Audit log"
        description="GET /audit-logs requires audit.read. Records are append-only. This UI cannot edit or delete history."
      />
      <SharedQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No audit entries"
        emptyDescription="Tier A/B events appear here when the backend writes them. This is not a cleared log."
        unavailableTitle="Service is not currently available."
      >
        <Table caption="Audit log">
          <TableHead>
            <TableHeaderCell>When</TableHeaderCell>
            <TableHeaderCell>Actor</TableHeaderCell>
            <TableHeaderCell>Action</TableHeaderCell>
            <TableHeaderCell>Entity</TableHeaderCell>
            <TableHeaderCell>Entity ID</TableHeaderCell>
            <TableHeaderCell>IP</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((entry) => (
              <TableRow key={entry.id}>
                <TableCell mono>{formatTimestamp(entry.createdAt)}</TableCell>
                <TableCell mono>
                  {entry.actorType ? enumLabel(entry.actorType) : "—"}
                  {entry.actorId ? ` · ${entry.actorId}` : ""}
                </TableCell>
                <TableCell mono>{entry.action}</TableCell>
                <TableCell mono>{entry.entityType}</TableCell>
                <TableCell mono>{entry.entityId}</TableCell>
                <TableCell mono>{entry.ipAddress ?? "—"}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SharedQueryState>
      <p className="type-helper text-steel">
        Need the full history later? This page is the only audit surface.{" "}
        <Link href="/settings/roles" className="font-semibold hover:underline">
          Roles reference
        </Link>
      </p>
    </div>
  );
}
