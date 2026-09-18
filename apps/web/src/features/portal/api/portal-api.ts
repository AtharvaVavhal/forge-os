import { browserMutate } from "@/lib/api/browser-mutate";
import { apiClient } from "@/lib/api/client";
import { unwrapData } from "@/lib/api/parse-json";
import {
  parsePortalClientUser,
  parsePortalDocumentsList,
  parsePortalHandoverSummary,
  parsePortalInvoice,
  parsePortalInvoicesList,
  parsePortalMilestone,
  parsePortalProject,
  parsePortalProjectsList,
  parsePortalProposal,
  parsePortalProposalsList,
  parsePortalSignedDownloadUrl,
  parsePortalPayOrder,
  parsePortalSupportTicket,
  parsePortalSupportTicketsList,
} from "./parse";
import { portalPaths } from "./portal-paths";
import type {
  OffsetList,
  PortalClientUser,
  PortalDocument,
  PortalHandoverSummary,
  PortalInvoice,
  PortalLoginRequest,
  PortalMilestone,
  PortalPayOrder,
  PortalProject,
  PortalProposal,
  PortalSignedDownloadUrl,
  PortalSupportTicket,
} from "../types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function loginPortal(body: PortalLoginRequest): Promise<PortalClientUser | null> {
  const response = await browserMutate<unknown>("POST", portalPaths.auth.login, { body });
  return parsePortalClientUser(response);
}

export async function logoutPortal(): Promise<void> {
  await browserMutate<void>("POST", portalPaths.auth.logout);
}

export async function fetchPortalMe(): Promise<PortalClientUser | null> {
  const raw = await apiClient.get<unknown>(portalPaths.me);
  return parsePortalClientUser(raw);
}

export async function listPortalProjects(
  filters?: Record<string, string | number | boolean | undefined>
): Promise<OffsetList<PortalProject>> {
  const raw = await apiClient.get<unknown>(portalPaths.projects, { query: filters });
  return parsePortalProjectsList(raw);
}

export async function getPortalProject(id: string): Promise<PortalProject | null> {
  const raw = await apiClient.get<unknown>(portalPaths.project(id));
  return parsePortalProject(raw);
}

export async function getPortalProjectMilestones(id: string): Promise<PortalMilestone[]> {
  const raw = await apiClient.get<unknown>(portalPaths.projectMilestones(id));
  const data = unwrapData(raw);
  if (!Array.isArray(data)) return [];
  return data
    .map(parsePortalMilestone)
    .filter((m): m is PortalMilestone => m !== null);
}

export async function getPortalProjectHandover(id: string): Promise<PortalHandoverSummary> {
  const raw = await apiClient.get<unknown>(portalPaths.projectHandover(id));
  return parsePortalHandoverSummary(raw);
}

export async function listPortalProposals(
  filters?: Record<string, string | number | boolean | undefined>
): Promise<OffsetList<PortalProposal>> {
  const raw = await apiClient.get<unknown>(portalPaths.proposals, { query: filters });
  return parsePortalProposalsList(raw);
}

export async function getPortalProposal(id: string): Promise<PortalProposal | null> {
  const raw = await apiClient.get<unknown>(portalPaths.proposal(id));
  return parsePortalProposal(raw);
}

export async function acceptPortalProposal(id: string): Promise<PortalProposal | null> {
  const raw = await browserMutate<unknown>("POST", portalPaths.acceptProposal(id));
  return parsePortalProposal(raw);
}

export async function listPortalInvoices(
  filters?: Record<string, string | number | boolean | undefined>
): Promise<OffsetList<PortalInvoice>> {
  const raw = await apiClient.get<unknown>(portalPaths.invoices, { query: filters });
  return parsePortalInvoicesList(raw);
}

export async function getPortalInvoice(id: string): Promise<PortalInvoice | null> {
  const raw = await apiClient.get<unknown>(portalPaths.invoice(id));
  return parsePortalInvoice(raw);
}

/** Starts Razorpay checkout for a payable portal invoice (does not mark paid). */
export async function payPortalInvoice(id: string): Promise<PortalPayOrder> {
  const raw = await browserMutate<unknown>("POST", portalPaths.invoicePay(id), {
    idempotencyKey: crypto.randomUUID(),
  });
  return requireParsed(parsePortalPayOrder(raw), "portal pay order");
}

export async function listPortalDocuments(
  filters?: Record<string, string | number | boolean | undefined>
): Promise<OffsetList<PortalDocument>> {
  const raw = await apiClient.get<unknown>(portalPaths.documents, { query: filters });
  return parsePortalDocumentsList(raw);
}

export async function getPortalDocumentDownloadUrl(id: string): Promise<PortalSignedDownloadUrl | null> {
  const raw = await apiClient.get<unknown>(portalPaths.documentDownloadUrl(id));
  return parsePortalSignedDownloadUrl(raw);
}

export async function listPortalSupportTickets(
  filters?: Record<string, string | number | boolean | undefined>
): Promise<OffsetList<PortalSupportTicket>> {
  const raw = await apiClient.get<unknown>(portalPaths.supportTickets, { query: filters });
  return parsePortalSupportTicketsList(raw);
}

export async function createPortalSupportTicket(body: {
  projectId: string;
  subject: string;
}): Promise<PortalSupportTicket> {
  const raw = await browserMutate<unknown>("POST", portalPaths.supportTickets, { body });
  return requireParsed(parsePortalSupportTicket(raw), "portal support ticket");
}
