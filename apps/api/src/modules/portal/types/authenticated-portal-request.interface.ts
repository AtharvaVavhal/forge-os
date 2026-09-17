import type { Request } from "express";
import type { AuthenticatedUser } from "../../auth/types/authenticated-request.interface";

/**
 * Portal identity attached by `PortalAuthGuard` after validating
 * `portal_session` (`aud: portal`) and re-checking the live `ClientUser`
 * row (Document 6 §9.1). Distinct from internal `AuthenticatedUser`.
 */
export interface AuthenticatedPortalUser {
  id: string;
  organizationId: string;
  companyId: string;
  email: string;
  contactId: string | null;
}

export interface AuthenticatedPortalRequest extends Request {
  /** Internal User — never set on portal-authenticated requests. */
  user?: AuthenticatedUser;
  /** ClientUser — set by PortalAuthGuard. */
  portalUser?: AuthenticatedPortalUser;
  id?: string;
}
