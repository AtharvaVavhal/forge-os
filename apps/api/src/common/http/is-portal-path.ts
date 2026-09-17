/**
 * Detects Client Portal HTTP paths (`/api/v1/portal…`).
 * Used by the global internal JwtAuthGuard to skip the internal plane
 * so PortalAuthGuard can own portal authentication (Document 5 §2.1 / §11;
 * Document 6 §1.1).
 */
export function isPortalHttpPath(request: {
  path?: string;
  url?: string;
  originalUrl?: string;
}): boolean {
  const raw =
    request.path ||
    request.originalUrl?.split("?")[0] ||
    request.url?.split("?")[0] ||
    "";
  return raw.includes("/portal/") || raw.endsWith("/portal");
}
