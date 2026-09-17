export const VISIBILITIES = ["INTERNAL", "CLIENT_VISIBLE"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const DOCUMENT_CATEGORIES = [
  "PROPOSAL",
  "CONTRACT",
  "INVOICE",
  "RECEIPT",
  "HANDOVER",
  "REQUIREMENT",
  "CLIENT_ASSET",
  "INTERNAL",
] as const;
export type DocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];

export const ACTOR_TYPES = ["USER", "CLIENT_USER", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

export const NOTIFICATION_CHANNELS = ["IN_APP", "EMAIL"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export interface Note {
  id: string;
  body: string;
  visibility: Visibility;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  projectId: string | null;
  createdBy: string | null;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface DocumentRecord {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  category: DocumentCategory;
  visibility: Visibility;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  projectId: string | null;
  invoiceId: string | null;
  uploadedBy: string | null;
  deletedAt: string | null;
  createdAt: string | null;
}

export interface NotificationRecord {
  id: string;
  type: string;
  channel: NotificationChannel | null;
  readAt: string | null;
  createdAt: string | null;
}

export interface AuditLogRecord {
  id: string;
  actorType: ActorType | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  ipAddress: string | null;
  createdAt: string | null;
}

export interface SearchHit {
  id: string;
  entityType: string | null;
  title: string;
}

export interface Activity {
  id: string;
  type: string;
  summary: string;
  occurredAt: string | null;
  companyId: string | null;
  contactId: string | null;
  dealId: string | null;
  projectId: string | null;
  createdBy: string | null;
}

export interface CursorList<T> {
  items: T[];
  limit: number;
  nextCursor: string | null;
}

export type RecordParent = {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  projectId?: string;
  invoiceId?: string;
};

export const MAX_DOCUMENT_BYTES = 25 * 1024 * 1024;
