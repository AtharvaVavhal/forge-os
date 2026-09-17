/**
 * Mirrors the frozen `UserRole` enum in prisma/schema.prisma exactly.
 *
 * This is a hand-maintained literal union, not a generated type — the frontend
 * (apps/web) must not depend on `@prisma/client` (that's a server-only package,
 * and pulling it into a browser bundle would be a real problem, not just a style
 * issue). If this list and the Prisma enum ever disagree, prisma/schema.prisma
 * is the source of truth; fix this file, never the other way around.
 *
 * Frozen — do not add a role here (e.g. `CUSTOMER`) without first updating the
 * frozen database architecture. Portal identity (`ClientUser`) is never a
 * `UserRole` value; see Document 6 §1.1.
 */
export const USER_ROLES = [
  "FOUNDER_ADMIN",
  "OPERATIONS",
  "FINANCE",
  "SALES",
  "TEAM_MEMBER",
] as const;

export type UserRole = (typeof USER_ROLES)[number];
