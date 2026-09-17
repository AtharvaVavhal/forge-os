export const teamPaths = {
  members: "/team/members",
  workload: "/team/workload",
  invitations: "/invitations",
  invitation: (id: string) => `/invitations/${id}`,
  revokeInvitation: (id: string) => `/invitations/${id}/revoke`,
} as const;
