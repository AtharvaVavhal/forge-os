import type { RecordParent } from "./types";

export type NoteParent = Pick<RecordParent, "companyId" | "contactId" | "dealId" | "projectId">;
export type ActivityParent = NoteParent;
export type DocumentParent = RecordParent;

export function definedParent(parent: RecordParent): Record<string, string> {
  const query: Record<string, string> = {};
  if (parent.companyId) query.companyId = parent.companyId;
  if (parent.contactId) query.contactId = parent.contactId;
  if (parent.dealId) query.dealId = parent.dealId;
  if (parent.projectId) query.projectId = parent.projectId;
  if (parent.invoiceId) query.invoiceId = parent.invoiceId;
  return query;
}

export function notesWritePermission(parent: NoteParent): "crm.manage" | "projects.manage" {
  return parent.projectId ? "projects.manage" : "crm.manage";
}

export function activityWritePermission(parent: ActivityParent): "crm.manage" | "projects.manage" {
  return parent.projectId ? "projects.manage" : "crm.manage";
}
