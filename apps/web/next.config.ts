import type { NextConfig } from "next";
import { resolveRewriteApiOrigin } from "./src/lib/api/resolve-rewrite-origin";

/**
 * Resolve API origin for rewrites/CSP. Production fails closed — never
 * rewrite to localhost when NODE_ENV=production.
 */
function apiOrigin(): string {
  return resolveRewriteApiOrigin(process.env.NEXT_PUBLIC_API_BASE_URL, process.env.NODE_ENV);
}

function securityHeaders(): { key: string; value: string }[] {
  const headers: { key: string; value: string }[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(self)",
    },
    {
      key: "Content-Security-Policy",
      value: [
        "default-src 'self'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
        "object-src 'none'",
        // Next.js App Router typically needs inline/eval; Razorpay Checkout needs its CDN.
        // Accepted limitation: CSP is not fully strict while these remain.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://checkout.razorpay.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https:",
        "font-src 'self' data:",
        `connect-src 'self' ${apiOrigin()} https://api.razorpay.com https://lumberjack.razorpay.com https://accounts.google.com`,
        "frame-src https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com",
        "worker-src 'self' blob:",
      ].join("; "),
    },
  ];

  // HSTS only in production builds. TLS terminators may also set this;
  // duplicate HSTS headers are acceptable (browsers use the max age).
  if (process.env.NODE_ENV === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
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
