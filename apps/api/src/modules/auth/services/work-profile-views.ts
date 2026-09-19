import type { User } from "@prisma/client";

/** Lightweight internal "Work Profile" — never gated on, never required. No sensitive data. */
export interface WorkProfileView {
  jobTitle: string | null;
  primaryArea: string | null;
  skills: string[];
  bio: string | null;
  updatedAt: string;
}

export function toWorkProfileView(
  user: Pick<User, "job_title" | "primary_area" | "skills" | "bio" | "updated_at">
): WorkProfileView {
  return {
    jobTitle: user.job_title,
    primaryArea: user.primary_area,
    skills: user.skills,
    bio: user.bio,
    updatedAt: user.updated_at.toISOString(),
  };
}
