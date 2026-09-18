import type { NextConfig } from "next";
import { resolveRewriteApiOrigin } from "./src/lib/api/resolve-rewrite-origin";
import { buildSecurityHeaders } from "./src/lib/security/csp";

/**
 * Resolve API origin for rewrites/CSP. Production fails closed — never
 * rewrite to localhost when NODE_ENV=production.
 */
function apiOrigin(): string {
  return resolveRewriteApiOrigin(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);
}

function securityHeaders(): { key: string; value: string }[] {
  return buildSecurityHeaders(apiOrigin(), process.env.NODE_ENV);
}

const nextConfig: NextConfig = {
  // Lets Next.js's own build pipeline transpile the workspace packages
  // directly from TypeScript source rather than requiring them to be
  // pre-built to JS — the reason apps/web can depend on @forge/types and
  // @forge/api-client without a separate build step for either (see
  // docs/IMPLEMENTATION-PHASE-0.md for why apps/api takes a different
  // approach for cross-package types).
  transpilePackages: ["@forge/types", "@forge/api-client"],
  // Same-origin `/api/v1` so the httpOnly `forge_session` cookie is first-party
  // (Document 6 §5, SameSite=Strict). Proxies the documented Nest prefix only.
  async rewrites() {
    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiOrigin()}/api/v1/:path*`,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
      {
        // Password-reset token may appear in ?token= — avoid leaking via Referer.
        source: "/reset-password",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
      {
        // Invitation token lives in the path — avoid leaking via Referer.
        source: "/invite/:path*",
        headers: [{ key: "Referrer-Policy", value: "no-referrer" }],
      },
    ];
  },
};

export default nextConfig;
