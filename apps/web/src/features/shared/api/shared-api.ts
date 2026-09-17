import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import {
  parseActivity,
  parseActivityList,
  parseAuditLogList,
  parseDocumentList,
  parseDocumentRecord,
  parseNote,
  parseNoteList,
  parseNotificationList,
  parseNotificationRecord,
  parsePresign,
  parseSearchHits,
  parseSignedUrl,
} from "./parse";
import { sharedPaths } from "./paths";
import { definedParent, type ActivityParent, type DocumentParent, type NoteParent } from "./parent";
import { MAX_DOCUMENT_BYTES, type DocumentCategory, type Visibility } from "./types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function listActivities(
  parent: ActivityParent,
  query: { cursor?: string; limit?: number } = {}
) {
  const payload = await apiClient.get<unknown>(sharedPaths.activities, {
    query: { ...definedParent(parent), cursor: query.cursor, limit: query.limit ?? 25 },
  });
  return requireParsed(parseActivityList(payload), "activity list");
}

export async function createActivity(
  body: ActivityParent & {
    type: string;
    summary: string;
    nextFollowUpAt?: string;
  }
) {
  const payload = await browserMutate<unknown>("POST", sharedPaths.activities, { body });
  return requireParsed(parseActivity(payload), "activity");
}

export async function listNotes(parent: NoteParent, query: { cursor?: string; limit?: number } = {}) {
  const payload = await apiClient.get<unknown>(sharedPaths.notes, {
    query: { ...definedParent(parent), cursor: query.cursor, limit: query.limit ?? 25 },
  });
  return requireParsed(parseNoteList(payload), "note list");
}

export async function createNote(
  body: NoteParent & { body: string; visibility: Visibility }
) {
  const payload = await browserMutate<unknown>("POST", sharedPaths.notes, { body });
  return requireParsed(parseNote(payload), "note");
}

export async function updateNote(id: string, body: { body?: string; visibility?: Visibility }) {
  const payload = await browserMutate<unknown>("PATCH", sharedPaths.note(id), { body });
  return requireParsed(parseNote(payload), "note");
}

export async function listDocuments(parent: DocumentParent, query: { cursor?: string; limit?: number } = {}) {
  const payload = await apiClient.get<unknown>(sharedPaths.documents, {
    query: { ...definedParent(parent), cursor: query.cursor, limit: query.limit ?? 25 },
  });
  return requireParsed(parseDocumentList(payload), "document list");
}

export async function registerDocument(
  body: DocumentParent & {
    filename: string;
    mimeType: string;
    sizeBytes: number;
    category: DocumentCategory;
    visibility: Visibility;
    storageKey?: string;
  }
) {
  const payload = await browserMutate<unknown>("POST", sharedPaths.documents, { body });
  return requireParsed(parseDocumentRecord(payload), "document");
}

export async function getDocumentDownloadUrl(id: string) {
  const payload = await apiClient.get<unknown>(sharedPaths.documentDownload(id));
  const url = parseSignedUrl(payload);
  if (!url) {
    throw new Error("Download URL was not returned by the API.");
  }
  return url;
}

export async function deleteDocument(id: string) {
  const payload = await browserMutate<unknown>("POST", sharedPaths.documentDelete(id), { body: {} });
  return requireParsed(parseDocumentRecord(payload), "document");
}

export async function uploadDocument(
  file: File,
  meta: DocumentParent & { category: DocumentCategory; visibility: Visibility }
) {
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new Error("Files larger than 25MB are not accepted.");
  }
  const presignPayload = await browserMutate<unknown>("POST", sharedPaths.presignUpload, {
    body: {
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      category: meta.category,
      visibility: meta.visibility,
      ...definedParent(meta),
    },
  });
  const presign = parsePresign(presignPayload);
  if (!presign) {
    throw new Error("The API did not return an upload URL.");
  }

  let uploaded: Response;
  try {
    uploaded = await fetch(presign.url, {
      method: presign.method,
      body: file,
      headers: { "Content-Type": file.type || "application/octet-stream" },
    });
  } catch (cause) {
    throw new Error("Could not reach storage for this upload.", { cause });
  }
  if (!uploaded.ok) {
    throw new Error("Storage rejected this upload.");
  }

  return registerDocument({
    filename: file.name,
    mimeType: file.type || "application/octet-stream",
    sizeBytes: file.size,
    category: meta.category,
    visibility: meta.visibility,
    storageKey: presign.storageKey ?? undefined,
    ...definedParent(meta),
  });
}

export async function listNotifications(query: { cursor?: string; limit?: number } = {}) {
  const payload = await apiClient.get<unknown>(sharedPaths.notifications, {
    query: { cursor: query.cursor, limit: query.limit ?? 25 },
  });
  return requireParsed(parseNotificationList(payload), "notification list");
}

export async function markNotificationRead(id: string) {
  const payload = await browserMutate<unknown>("POST", sharedPaths.notificationRead(id), { body: {} });
  return requireParsed(parseNotificationRecord(payload), "notification");
}

export async function listAuditLogs(query: { cursor?: string; limit?: number } = {}) {
  const payload = await apiClient.get<unknown>(sharedPaths.auditLogs, {
    query: { cursor: query.cursor, limit: query.limit ?? 25 },
  });
  return requireParsed(parseAuditLogList(payload), "audit log list");
}

export async function searchRecords(q: string) {
  const payload = await apiClient.get<unknown>(sharedPaths.search, { query: { q } });
  return requireParsed(parseSearchHits(payload), "search hits");
}

export type { ActivityParent, NoteParent, DocumentParent };
