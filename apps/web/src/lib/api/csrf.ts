/**
 * Double-submit CSRF (cookie `forge_csrf`, header `X-CSRF-Token`).
 *
 * Document 6 left an internal CSRF token as NOT CURRENTLY DEFINED; the
 * parallel backend implements this pair. The frontend only *echoes* a
 * cookie the server already set — it never mints or stores a token of its
 * own. `@forge/api-client` has no header hook, so this lives in apps/web.
 */

export const CSRF_COOKIE_NAME = "forge_csrf";
export const PORTAL_CSRF_COOKIE_NAME = "portal_csrf";
export const CSRF_HEADER_NAME = "X-CSRF-Token";

export function readCsrfToken(
  cookieSource: string | undefined = typeof document === "undefined" ? undefined : document.cookie
): string | undefined {
  if (!cookieSource) return undefined;
  const match = cookieSource
    .split("; ")
    .find((part) => part.startsWith(`${PORTAL_CSRF_COOKIE_NAME}=`) || part.startsWith(`${CSRF_COOKIE_NAME}=`));
  if (!match) return undefined;
  const equalsIdx = match.indexOf("=");
  return decodeURIComponent(match.slice(equalsIdx + 1));
}
