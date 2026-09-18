"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert } from "@/components/feedback/alert";
import { Table, TableBody, TableCell, TableHead, TableHeaderCell, TableRow } from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getPortalDocumentDownloadUrl, listPortalDocuments } from "../api/portal-api";
import { portalKeys } from "../api/query-keys";
import { queryErrorMessage } from "@/lib/api/query-error";
import { openTrustedHttpsUrl } from "@/lib/security/safe-url";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function PortalDocumentsPage() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: portalKeys.documents.list(),
    queryFn: () => listPortalDocuments(),
  });

  const handleDownload = async (id: string) => {
    setDownloadingId(id);
    setDownloadError(null);
    try {
      const res = await getPortalDocumentDownloadUrl(id);
      if (res?.url && openTrustedHttpsUrl(res.url)) {
        return;
      }
      setDownloadError(
        res?.url
          ? "Download link was not a trusted HTTPS URL."
          : "Download link could not be generated. Please try again."
      );
    } catch (err) {
      setDownloadError(queryErrorMessage(err));
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="space-y-6" data-testid="portal-documents-page">
      <div className="border-b border-[var(--forge-border,#e5dfd5)] pb-5">
        <h1 className="text-2xl font-bold tracking-tight text-[var(--forge-ink,#1a1918)]">
          Documents
        </h1>
        <p className="text-sm text-[var(--forge-ink-muted,#78736a)] mt-1">
          Access and download documents, deliverables, and contracts shared with your company.
        </p>
      </div>

      {downloadError && (
        <div data-testid="portal-document-download-error">
          <Alert tone="danger" title="Download Error">
            {downloadError}
          </Alert>
        </div>
      )}

      {isLoading && (
        <Card className="p-6 space-y-3 bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-documents-loading">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </Card>
      )}

      {isError && (
        <div data-testid="portal-documents-error">
          <Alert tone="danger" title="Service Unavailable">
            {queryErrorMessage(error)}
          </Alert>
        </div>
      )}

      {data && data.items.length === 0 && (
        <Card className="p-12 text-center bg-white border-[var(--forge-border,#e5dfd5)]" data-testid="portal-documents-empty">
          <p className="text-sm text-[var(--forge-ink-muted,#78736a)]">
            No documents have been shared with your company yet.
          </p>
        </Card>
      )}

      {data && data.items.length > 0 && (
        <Card className="overflow-hidden bg-white border-[var(--forge-border,#e5dfd5)]">
          <Table caption="Documents">
            <TableHead>
              <TableHeaderCell>Title</TableHeaderCell>
              <TableHeaderCell>File Name</TableHeaderCell>
              <TableHeaderCell>Size</TableHeaderCell>
              <TableHeaderCell>Date Shared</TableHeaderCell>
              <TableHeaderCell className="text-right">Action</TableHeaderCell>
            </TableHead>
            <TableBody>
              {data.items.map((doc) => (
                <TableRow key={doc.id} data-testid={`portal-document-row-${doc.id}`}>
                  <TableCell className="font-medium text-sm text-[var(--forge-ink,#1a1918)]">
                    {doc.title}
                  </TableCell>
                  <TableCell className="text-xs font-mono text-[var(--forge-ink-muted,#78736a)]">
                    {doc.fileName}
                  </TableCell>
                  <TableCell className="text-xs text-[var(--forge-ink-muted,#78736a)]">
                    {formatBytes(doc.fileSizeBytes)}
                  </TableCell>
                  <TableCell className="text-sm text-[var(--forge-ink-muted,#78736a)]">
                    {new Date(doc.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => handleDownload(doc.id)}
                      disabled={downloadingId === doc.id}
                      data-testid={`portal-document-download-${doc.id}`}
                    >
                      {downloadingId === doc.id ? "Preparing…" : "Download"}
                    </Button>
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
