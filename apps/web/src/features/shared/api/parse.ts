import {
  asInt,
  asIsoDate,
  asString,
  isRecord,
  parseListEnvelope,
  readField,
  unwrapData,
  type ParsedPagination,
} from "@/lib/api/parse-json";
import {
  ACTOR_TYPES,
  DOCUMENT_CATEGORIES,
  NOTIFICATION_CHANNELS,
  VISIBILITIES,
  type Activity,
  type ActorType,
  type AuditLogRecord,
  type CursorList,
  type DocumentCategory,
  type DocumentRecord,
  type Note,
  type NotificationChannel,
  type NotificationRecord,
  type SearchHit,
  type Visibility,
} from "./types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function toCursorList<T>(parsed: { items: T[]; pagination: ParsedPagination }): CursorList<T> {
  if (parsed.pagination.mode === "cursor") {
    return { items: parsed.items, limit: parsed.pagination.limit, nextCursor: parsed.pagination.nextCursor };
  }
  return { items: parsed.items, limit: parsed.pagination.pageSize, nextCursor: null };
}

export function parseNote(value: unknown): Note | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const body = asString(node.body);
  const visibility = inSet(node.visibility, VISIBILITIES) ?? "INTERNAL";
  if (!id || !body) return null;
  return {
    id,
    body,
    visibility: visibility as Visibility,
    companyId: asString(readField(node, "companyId", "company_id")) ?? null,
    contactId: asString(readField(node, "contactId", "contact_id")) ?? null,
    dealId: asString(readField(node, "dealId", "deal_id")) ?? null,
    projectId: asString(readField(node, "projectId", "project_id")) ?? null,
    createdBy: asString(readField(node, "createdBy", "created_by")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parseDocumentRecord(value: unknown): DocumentRecord | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const filename = asString(node.filename);
  const category = inSet(node.category, DOCUMENT_CATEGORIES);
  if (!id || !filename || !category) return null;
  return {
    id,
    filename,
    mimeType: asString(readField(node, "mimeType", "mime_type")) ?? null,
    sizeBytes: asInt(readField(node, "sizeBytes", "size_bytes")),
    category: category as DocumentCategory,
    visibility: (inSet(node.visibility, VISIBILITIES) ?? "INTERNAL") as Visibility,
    companyId: asString(readField(node, "companyId", "company_id")) ?? null,
    contactId: asString(readField(node, "contactId", "contact_id")) ?? null,
    dealId: asString(readField(node, "dealId", "deal_id")) ?? null,
    projectId: asString(readField(node, "projectId", "project_id")) ?? null,
    invoiceId: asString(readField(node, "invoiceId", "invoice_id")) ?? null,
    uploadedBy: asString(readField(node, "uploadedBy", "uploaded_by")) ?? null,
    deletedAt: asIsoDate(readField(node, "deletedAt", "deleted_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parseNotificationRecord(value: unknown): NotificationRecord | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const type = asString(node.type);
  if (!id || !type) return null;
  return {
    id,
    type,
    channel: inSet(node.channel, NOTIFICATION_CHANNELS) as NotificationChannel | null,
    readAt: asIsoDate(readField(node, "readAt", "read_at")),
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parseAuditLogRecord(value: unknown): AuditLogRecord | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const action = asString(node.action);
  const entityType = asString(readField(node, "entityType", "entity_type"));
  const entityId = asString(readField(node, "entityId", "entity_id"));
  if (!id || !action || !entityType || !entityId) return null;
  return {
    id,
    actorType: inSet(readField(node, "actorType", "actor_type"), ACTOR_TYPES) as ActorType | null,
    actorId: asString(readField(node, "actorId", "actor_id")) ?? null,
    action,
    entityType,
    entityId,
    ipAddress: asString(readField(node, "ipAddress", "ip_address")) ?? null,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
  };
}

export function parseSearchHit(value: unknown): SearchHit | null {
  const node = isRecord(value) ? value : null;
  if (!node) return null;
  const id = asString(node.id);
  const title =
    asString(node.title) ?? asString(node.name) ?? asString(node.summary) ?? asString(node.label);
  if (!id || !title) return null;
  return {
    id,
    entityType:
      asString(readField(node, "entityType", "entity_type")) ?? asString(node.type) ?? null,
    title,
  };
}

export function parseActivity(value: unknown): Activity | null {
  const node = isRecord(unwrapData(value)) ? (unwrapData(value) as Record<string, unknown>) : null;
  if (!node) return null;
  const id = asString(node.id);
  const type = asString(node.type);
  const summary = asString(node.summary);
  if (!id || !type || !summary) return null;
  return {
    id,
    type,
    summary,
    occurredAt: asIsoDate(readField(node, "occurredAt", "occurred_at")),
    companyId: asString(readField(node, "companyId", "company_id")) ?? null,
    contactId: asString(readField(node, "contactId", "contact_id")) ?? null,
    dealId: asString(readField(node, "dealId", "deal_id")) ?? null,
    projectId: asString(readField(node, "projectId", "project_id")) ?? null,
    createdBy: asString(readField(node, "createdBy", "created_by")) ?? null,
  };
}

export function parseActivityList(payload: unknown): CursorList<Activity> | null {
  const parsed = parseListEnvelope(payload, parseActivity);
  return parsed ? toCursorList(parsed) : null;
}

export function parseNoteList(payload: unknown): CursorList<Note> | null {
  const parsed = parseListEnvelope(payload, parseNote);
  return parsed ? toCursorList(parsed) : null;
}

export function parseDocumentList(payload: unknown): CursorList<DocumentRecord> | null {
  const parsed = parseListEnvelope(payload, parseDocumentRecord);
  return parsed ? toCursorList(parsed) : null;
}

export function parseNotificationList(payload: unknown): CursorList<NotificationRecord> | null {
  const parsed = parseListEnvelope(payload, parseNotificationRecord);
  return parsed ? toCursorList(parsed) : null;
}

export function parseAuditLogList(payload: unknown): CursorList<AuditLogRecord> | null {
  const parsed = parseListEnvelope(payload, parseAuditLogRecord);
  return parsed ? toCursorList(parsed) : null;
}

export function parseSearchHits(payload: unknown): SearchHit[] | null {
  const parsed = parseListEnvelope(payload, parseSearchHit);
  if (parsed) return parsed.items;
  const data = unwrapData(payload);
  if (Array.isArray(data)) {
    return data.map(parseSearchHit).filter((item): item is SearchHit => item !== null);
  }
  if (isRecord(data) && Array.isArray(data.hits)) {
    return data.hits.map(parseSearchHit).filter((item): item is SearchHit => item !== null);
  }
  return null;
}

export function parseSignedUrl(payload: unknown): string | null {
  const data = isRecord(unwrapData(payload)) ? (unwrapData(payload) as Record<string, unknown>) : isRecord(payload) ? payload : null;
  if (!data) return null;
  return (
    asString(data.url) ??
    asString(data.downloadUrl) ??
    asString(data.download_url) ??
    asString(data.uploadUrl) ??
    asString(data.upload_url) ??
    null
  );
}

export function parsePresign(payload: unknown): { url: string; storageKey: string | null; method: string } | null {
  const data = isRecord(unwrapData(payload)) ? (unwrapData(payload) as Record<string, unknown>) : isRecord(payload) ? payload : null;
  if (!data) return null;
  const url = parseSignedUrl(data);
  if (!url) return null;
  return {
    url,
    storageKey: asString(readField(data, "storageKey", "storage_key")) ?? null,
    method: asString(data.method)?.toUpperCase() ?? "PUT",
  };
}
