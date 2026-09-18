import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import { isRecord, unwrapData } from "@/lib/api/parse-json";
import {
  parseActivity,
  parseActivityList,
  parseCompany,
  parseCompanyList,
  parseContact,
  parseContactList,
  parseDeal,
  parseDealList,
  parseForgeFundBalance,
  parseForgeFundEntryList,
  parseLead,
  parseLeadConversion,
  parseLeadList,
  parseProjectList,
} from "./parse";
import { crmPaths } from "./paths";
import type { DealLostReason, DealStage, LeadSource, LeadStatus } from "./types";
import { dealTransitionBody, leadTransitionBody } from "./lifecycle";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export interface OffsetQuery {
  page?: number;
  pageSize?: number;
  q?: string;
  sort?: string;
}

export async function listCompanies(query: OffsetQuery & { tag?: string; archived?: boolean } = {}) {
  const payload = await apiClient.get<unknown>(crmPaths.companies, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      q: query.q || undefined,
      tag: query.tag || undefined,
      archived: query.archived,
    },
  });
  return requireParsed(parseCompanyList(payload), "company list");
}

export async function getCompany(id: string) {
  const payload = await apiClient.get<unknown>(crmPaths.company(id));
  return requireParsed(parseCompany(payload), "company");
}

export async function createCompany(body: {
  name: string;
  gstin?: string;
  billingState?: string;
  billingAddress?: string;
  tags?: string[];
}) {
  const payload = await browserMutate<unknown>("POST", crmPaths.companies, { body });
  return requireParsed(parseCompany(payload), "company");
}

export async function updateCompany(
  id: string,
  body: Partial<{
    name: string;
    gstin: string;
    billingState: string;
    billingAddress: string;
    tags: string[];
  }>
) {
  const payload = await browserMutate<unknown>("PATCH", crmPaths.company(id), { body });
  return requireParsed(parseCompany(payload), "company");
}

export async function archiveCompany(id: string) {
  await browserMutate<unknown>("POST", crmPaths.archiveCompany(id), { body: {} });
}

export async function listContacts(query: { cursor?: string; limit?: number } = {}) {
  const payload = await apiClient.get<unknown>(crmPaths.contacts, {
    query: { cursor: query.cursor, limit: query.limit },
  });
  return requireParsed(parseContactList(payload), "contact list");
}

export async function getContact(id: string) {
  const payload = await apiClient.get<unknown>(crmPaths.contact(id));
  return requireParsed(parseContact(payload), "contact");
}

export async function createContact(body: {
  name: string;
  email?: string;
  phone?: string;
  companyId?: string;
}) {
  const payload = await browserMutate<unknown>("POST", crmPaths.contacts, { body });
  return requireParsed(parseContact(payload), "contact");
}

export async function updateContact(
  id: string,
  body: Partial<{ name: string; email: string; phone: string; companyId: string }>
) {
  const payload = await browserMutate<unknown>("PATCH", crmPaths.contact(id), { body });
  return requireParsed(parseContact(payload), "contact");
}

export async function archiveContact(id: string) {
  await browserMutate<unknown>("POST", crmPaths.archiveContact(id), { body: {} });
}

export async function listLeads(
  query: OffsetQuery & { status?: LeadStatus; source?: LeadSource } = {}
) {
  const payload = await apiClient.get<unknown>(crmPaths.leads, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      q: query.q || undefined,
      status: query.status,
      source: query.source,
    },
  });
  return requireParsed(parseLeadList(payload), "lead list");
}

export async function getLead(id: string) {
  const payload = await apiClient.get<unknown>(crmPaths.lead(id));
  return requireParsed(parseLead(payload), "lead");
}

export async function createLead(body: {
  companyId?: string;
  contactId?: string;
  source: LeadSource;
  notes?: string;
}) {
  const payload = await browserMutate<unknown>("POST", crmPaths.leads, { body });
  return requireParsed(parseLead(payload), "lead");
}

export async function updateLead(
  id: string,
  body: Partial<{ companyId: string; contactId: string; source: LeadSource; notes: string }>
) {
  const payload = await browserMutate<unknown>("PATCH", crmPaths.lead(id), { body });
  return requireParsed(parseLead(payload), "lead");
}

export async function transitionLead(id: string, to: Exclude<LeadStatus, "CONVERTED">) {
  const payload = await browserMutate<unknown>("POST", crmPaths.transitionLead(id), {
    body: leadTransitionBody(to),
  });
  return requireParsed(parseLead(payload), "lead");
}

export async function convertLead(
  id: string,
  body: { title: string; estimatedValue: string; ownerId?: string }
) {
  const payload = await browserMutate<unknown>("POST", crmPaths.convertLead(id), { body });
  return requireParsed(parseLeadConversion(payload), "lead conversion");
}

export async function archiveLead(id: string) {
  await browserMutate<unknown>("POST", crmPaths.archiveLead(id), { body: {} });
}

export async function listDeals(query: OffsetQuery & { stage?: DealStage; ownerId?: string } = {}) {
  const payload = await apiClient.get<unknown>(crmPaths.deals, {
    query: {
      page: query.page,
      pageSize: query.pageSize,
      q: query.q || undefined,
      stage: query.stage,
      ownerId: query.ownerId,
    },
  });
  return requireParsed(parseDealList(payload), "deal list");
}

export async function getDeal(id: string) {
  const payload = await apiClient.get<unknown>(crmPaths.deal(id));
  return requireParsed(parseDeal(payload), "deal");
}

export async function createDeal(body: {
  title: string;
  companyId?: string;
  contactId?: string;
  estimatedValue: string;
  ownerId: string;
}) {
  const payload = await browserMutate<unknown>("POST", crmPaths.deals, { body });
  return requireParsed(parseDeal(payload), "deal");
}

export async function updateDeal(
  id: string,
  body: Partial<{
    title: string;
    companyId: string;
    contactId: string;
    estimatedValue: string;
    nextFollowUpAt: string;
  }>
) {
  const payload = await browserMutate<unknown>("PATCH", crmPaths.deal(id), { body });
  return requireParsed(parseDeal(payload), "deal");
}

export async function transitionDeal(id: string, to: DealStage, lostReason?: DealLostReason) {
  const payload = await browserMutate<unknown>("POST", crmPaths.transitionDeal(id), {
    body: dealTransitionBody(to, lostReason),
  });
  return requireParsed(parseDeal(payload), "deal");
}

export async function reopenDeal(id: string) {
  const payload = await browserMutate<unknown>("POST", crmPaths.reopenDeal(id), { body: {} });
  return requireParsed(parseDeal(payload), "deal");
}

export async function archiveDeal(id: string) {
  await browserMutate<unknown>("POST", crmPaths.archiveDeal(id), { body: {} });
}

export async function bulkReassignDeals(body: { ids: string[]; ownerId: string }) {
  const payload = await browserMutate<unknown>("POST", crmPaths.bulkReassignDeals, { body });
  const node = isRecord(unwrapData(payload))
    ? (unwrapData(payload) as Record<string, unknown>)
    : isRecord(payload)
      ? payload
      : null;
  const count = typeof node?.count === "number" ? node.count : null;
  if (count === null) {
    throw new Error("Unexpected bulk reassign payload from the API.");
  }
  return { count };
}

export async function listActivities(query: {
  companyId?: string;
  contactId?: string;
  dealId?: string;
  projectId?: string;
  cursor?: string;
  limit?: number;
}) {
  const payload = await apiClient.get<unknown>(crmPaths.activities, { query });
  return requireParsed(parseActivityList(payload), "activity list");
}

export async function createActivity(body: {
  type: string;
  summary: string;
  companyId?: string;
  contactId?: string;
  dealId?: string;
  projectId?: string;
  nextFollowUpAt?: string;
}) {
  const payload = await browserMutate<unknown>("POST", crmPaths.activities, { body });
  return requireParsed(parseActivity(payload), "activity");
}

export async function listProjects(query: OffsetQuery = {}) {
  const payload = await apiClient.get<unknown>(crmPaths.projects, {
    query: { page: query.page, pageSize: query.pageSize },
  });
  return requireParsed(parseProjectList(payload), "project list");
}

export async function listForgeFundEntries(query: OffsetQuery = {}) {
  const payload = await apiClient.get<unknown>(crmPaths.forgeFundEntries, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseForgeFundEntryList(payload), "forge fund list");
}

export async function getForgeFundBalance() {
  const payload = await apiClient.get<unknown>(crmPaths.forgeFundBalance);
  return parseForgeFundBalance(payload);
}
