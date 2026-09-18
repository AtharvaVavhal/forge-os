"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@/components/data-display/table";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/forms/field";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/feedback/status-badge";
import { Drawer } from "@/components/overlays/drawer";
import { ConfirmationDialog } from "@/components/overlays/modal";
import { useToast } from "@/components/overlays/toast";
import { Can } from "@/features/auth/authorization/can";
import { FormActions } from "@/features/crm/components/page-chrome";
import { enumLabel, formatTimestamp } from "@/features/crm/format";
import { queryErrorMessage } from "@/lib/api/query-error";
import { openTrustedHttpsUrl } from "@/lib/security/safe-url";
import { SharedQueryState } from "./shared-query-state";
import {
  deleteDocument,
  getDocumentDownloadUrl,
  listDocuments,
  uploadDocument,
} from "../api/shared-api";
import { type DocumentParent } from "../api/parent";
import { sharedKeys } from "../api/query-keys";
import {
  DOCUMENT_CATEGORIES,
  VISIBILITIES,
  type DocumentCategory,
  type DocumentRecord,
  type Visibility,
} from "../api/types";
import { documentUploadSchema } from "../schemas/document-schema";

export function DocumentsPanel({ parent }: { parent: DocumentParent }) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<DocumentRecord | null>(null);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const filters = { ...parent, limit: 25 };

  const list = useQuery({
    queryKey: sharedKeys.documents.list(filters),
    queryFn: () => listDocuments(parent, { limit: 25 }),
  });

  const uploadMutation = useMutation({
    mutationFn: (values: { file: File; category: DocumentCategory; visibility: Visibility }) =>
      uploadDocument(values.file, { ...parent, category: values.category, visibility: values.visibility }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.documents.all });
      setUploadOpen(false);
      pushToast({ title: "Document registered", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Upload failed", description: queryErrorMessage(error), tone: "danger" }),
  });

  const downloadMutation = useMutation({
    mutationFn: getDocumentDownloadUrl,
    onSuccess: (url) => {
      if (!openTrustedHttpsUrl(url)) {
        pushToast({
          title: "Couldn’t open download",
          description: "The signed URL was not a trusted HTTPS link.",
          tone: "danger",
        });
      }
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t get download URL", description: queryErrorMessage(error), tone: "danger" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: sharedKeys.documents.all });
      setPendingDelete(null);
      pushToast({ title: "Document deleted", tone: "success" });
    },
    onError: (error) =>
      pushToast({ title: "Couldn’t delete", description: queryErrorMessage(error), tone: "danger" }),
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="type-section-title text-ink">Documents</h2>
          <p className="type-helper mt-1 text-steel">
            Presigned upload, then register. Signed URLs come from the API. Maximum 25MB.
          </p>
        </div>
        <Can permission="documents.manage">
          <Button onClick={() => setUploadOpen(true)}>Upload</Button>
        </Can>
      </div>
      <SharedQueryState
        isPending={list.isPending}
        isError={list.isError}
        error={list.error}
        isEmpty={list.isSuccess && list.data.items.length === 0}
        emptyTitle="No documents"
        emptyDescription="Files attached to this record will appear here."
        unavailableTitle="Document service is not currently available."
      >
        <Table caption="Documents">
          <TableHead>
            <TableHeaderCell>File</TableHeaderCell>
            <TableHeaderCell>Category</TableHeaderCell>
            <TableHeaderCell>Visibility</TableHeaderCell>
            <TableHeaderCell className="text-right">Size</TableHeaderCell>
            <TableHeaderCell>Uploaded</TableHeaderCell>
            <TableHeaderCell>Actions</TableHeaderCell>
          </TableHead>
          <TableBody>
            {list.data?.items.map((doc) => (
              <TableRow key={doc.id}>
                <TableCell>{doc.filename}</TableCell>
                <TableCell>{enumLabel(doc.category)}</TableCell>
                <TableCell>
                  <StatusBadge tone={doc.visibility === "CLIENT_VISIBLE" ? "info" : "neutral"}>
                    {enumLabel(doc.visibility)}
                  </StatusBadge>
                </TableCell>
                <TableCell mono className="text-right">
                  {doc.sizeBytes === null ? "—" : `${doc.sizeBytes} B`}
                </TableCell>
                <TableCell mono>{formatTimestamp(doc.createdAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-2">
                    <Can permission="documents.read">
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={downloadMutation.isPending}
                        onClick={() => downloadMutation.mutate(doc.id)}
                      >
                        Download
                      </Button>
                    </Can>
                    <Can permission="documents.manage">
                      <Button variant="destructive" size="sm" onClick={() => setPendingDelete(doc)}>
                        Delete
                      </Button>
                    </Can>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </SharedQueryState>
      <Drawer open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload document">
        <UploadFields
          pending={uploadMutation.isPending}
          onCancel={() => setUploadOpen(false)}
          onSubmit={(values) => uploadMutation.mutate(values)}
        />
      </Drawer>
      <ConfirmationDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
        title="Delete this document?"
        description="This is a soft delete. The file record is marked deleted; this cannot be undone from the UI."
        confirmLabel="Delete"
        destructive
        pending={deleteMutation.isPending}
      />
    </div>
  );
}

function UploadFields({
  pending,
  onCancel,
  onSubmit,
}: {
  pending: boolean;
  onCancel: () => void;
  onSubmit: (values: { file: File; category: DocumentCategory; visibility: Visibility }) => void;
}) {
  const [error, setError] = useState<string | undefined>();
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const file = form.get("file");
        const parsed = documentUploadSchema.safeParse({
          category: form.get("category"),
          visibility: form.get("visibility"),
          file,
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
      <Field id="document-file" label="File" required hint="25MB maximum. Upload uses a short-lived signed URL.">
        <input
          id="document-file"
          name="file"
          type="file"
          className="font-display w-full text-[length:var(--text-body-size)] text-ink"
        />
      </Field>
      <Field id="document-category" label="Category" required>
        <Select id="document-category" name="category" defaultValue="INTERNAL">
          {DOCUMENT_CATEGORIES.map((value) => (
            <option key={value} value={value}>
              {enumLabel(value)}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="document-visibility" label="Visibility" required>
        <Select id="document-visibility" name="visibility" defaultValue="INTERNAL">
          {VISIBILITIES.map((value) => (
            <option key={value} value={value}>
              {enumLabel(value)}
            </option>
          ))}
        </Select>
      </Field>
      <FormActions onCancel={onCancel} pending={pending} submitLabel="Upload" />
    </form>
  );
}
