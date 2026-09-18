/**
 * The web app origin for server-generated user-facing links (Google SSO
 * redirects, invitation emails, password-reset emails). Uses the first
 * entry in `CORS_ORIGINS`. Production operators must put the primary web
 * origin first (e.g. `https://app.forgebuilds.in`). Never hardcodes a host.
 */
export function resolveWebAppOrigin(corsOrigins: string[]): string {
  return (corsOrigins[0] ?? "http://localhost:3000").replace(/\/$/, "");
}
