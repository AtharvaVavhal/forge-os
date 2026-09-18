import type { UserRole } from "@forge/types";

export interface TeamMember {
  id: string;
  organizationId: string | null;
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
  lastLoginAt: string | null;
  createdAt: string | null;
}

export interface WorkloadRow {
  userId: string;
  name: string | null;
  email: string | null;
  role: UserRole | null;
  openTaskCount: number | null;
  timeEntryCount: number | null;
}

export interface OffsetList<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number | null;
}

export const INVITATION_SCOPES = ["TEAM", "CLIENT"] as const;
export type InvitationScope = (typeof INVITATION_SCOPES)[number];

/** Safe subset of POST /invitations — never includes a raw token. */
export interface CreateInvitationResult {
  invitation: {
    id: string;
    email: string;
  };
  emailSent: boolean;
}
