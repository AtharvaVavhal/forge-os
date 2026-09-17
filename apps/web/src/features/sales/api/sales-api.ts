import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import { parseProposal, parseProposalList } from "./parse";
import { salesPaths } from "./paths";
import type { ProposalStatus } from "./types";
import { proposalTransitionBody } from "./lifecycle";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function listProposals(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(salesPaths.proposals, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseProposalList(payload), "proposal list");
}

export async function getProposal(id: string) {
  const payload = await apiClient.get<unknown>(salesPaths.proposal(id));
  return requireParsed(parseProposal(payload), "proposal");
}

export async function createProposal(body: { dealId: string; terms?: string }) {
  const payload = await browserMutate<unknown>("POST", salesPaths.proposals, { body });
  return requireParsed(parseProposal(payload), "proposal");
}

export async function updateProposal(id: string, body: { terms?: string }) {
  const payload = await browserMutate<unknown>("PATCH", salesPaths.proposal(id), { body });
  return requireParsed(parseProposal(payload), "proposal");
}

export async function replaceProposalLineItems(
  id: string,
  lines: Array<{ description: string; quantity: string; unitPrice: string; taxRateId?: string; sortOrder?: number }>
) {
  const payload = await browserMutate<unknown>("PUT", salesPaths.lineItems(id), { body: { lines } });
  return requireParsed(parseProposal(payload), "proposal");
}

export async function sendProposal(id: string) {
  const payload = await browserMutate<unknown>("POST", salesPaths.send(id), { body: {} });
  return requireParsed(parseProposal(payload), "proposal");
}

export async function reviseProposal(id: string) {
  const payload = await browserMutate<unknown>("POST", salesPaths.revise(id), { body: {} });
  return requireParsed(parseProposal(payload), "proposal");
}

export async function transitionProposal(
  id: string,
  to: Extract<ProposalStatus, "VIEWED" | "REJECTED" | "EXPIRED">
) {
  const payload = await browserMutate<unknown>("POST", salesPaths.transition(id), {
    body: proposalTransitionBody(to),
  });
  return requireParsed(parseProposal(payload), "proposal");
}
