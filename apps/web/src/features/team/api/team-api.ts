import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import type { UserRole } from "@forge/types";
import { parseCreateInvitationResult, parseTeamMemberList, parseWorkloadView } from "./parse";
import { teamPaths } from "./paths";
import type { CreateInvitationResult, InvitationScope } from "./types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function listTeamMembers(query: { page?: number; pageSize?: number } = {}) {
  const payload = await apiClient.get<unknown>(teamPaths.members, {
    query: { page: query.page, pageSize: query.pageSize },
  });
  return requireParsed(parseTeamMemberList(payload), "team member list");
}

export async function getTeamWorkload() {
  const payload = await apiClient.get<unknown>(teamPaths.workload);
  return requireParsed(parseWorkloadView(payload), "workload view");
}

/**
 * Creates a TEAM or CLIENT invitation via POST /invitations (CSRF-protected).
 * Returns `emailSent` from the API. Any raw `token` in non-production
 * responses is stripped by the parser and never reaches callers.
 */
export async function createTeamInvitation(body: {
  scope: InvitationScope;
  email: string;
  userRole?: UserRole;
  companyId?: string;
}): Promise<CreateInvitationResult> {
  const payload = await browserMutate<unknown>("POST", teamPaths.invitations, { body });
  return requireParsed(parseCreateInvitationResult(payload), "create invitation");
}

export async function revokeInvitation(id: string) {
  await browserMutate<unknown>("POST", teamPaths.revokeInvitation(id), { body: {} });
}
