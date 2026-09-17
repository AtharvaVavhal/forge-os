/**
 * `portal_session` JWT payload (Document 6 §1.1 / §5.1).
 * Distinct audience from internal `forge_session` (`aud: internal`).
 */
export interface PortalSessionPayload {
  sub: string; // ClientUser.id
  org: string; // ClientUser.organization_id
  companyId: string; // ClientUser.company_id — hard scope key
  aud: "portal";
  iatMs: number;
  iat: number;
  exp: number;
}
