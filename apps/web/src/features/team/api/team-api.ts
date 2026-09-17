import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import type { UserRole } from "@forge/types";
import { parseTeamMemberList, parseWorkloadView } from "./parse";
import { teamPaths } from "./paths";
import type { InvitationScope } from "./types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function listTeamMembers(query: { page?: number; pageSize?: number; sort?: string } = {}) {
  const payload = await apiClient.get<unknown>(teamPaths.members, {
    query: { page: query.page, pageSize: query.pageSize, sort: query.sort },
  });
  return requireParsed(parseTeamMemberList(payload), "team member list");
}

export async function getTeamWorkload() {
  const payload = await apiClient.get<unknown>(teamPaths.workload);
  return requireParsed(parseWorkloadView(payload), "workload view");
}

export async function createTeamInvitation(body: {
  scope: InvitationScope;
  email: string;
  userRole?: UserRole;
  companyId?: string;
}) {
  await browserMutate<unknown>("POST", teamPaths.invitations, { body });
}

export async function revokeInvitation(id: string) {
  await browserMutate<unknown>("POST", teamPaths.revokeInvitation(id), { body: {} });
}
