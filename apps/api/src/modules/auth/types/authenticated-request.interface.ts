import type { Request } from "express";
import type { UserRole } from "@prisma/client";

/**
 * The identity `JwtAuthGuard` attaches to `request.user` after validating
 * the session cookie *and* re-checking the live `User` row (active flag,
 * security-stamp fence — see jwt-auth.guard.ts). Every field here is a
 * server-verified fact about the current request, not a raw, unverified
 * claim copied from the token.
 */
export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  role: UserRole;
  email: string;
  name: string;
  active: boolean;
  onboardedAt: Date | null;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  id?: string;
}
