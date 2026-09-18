import type { NextConfig } from "next";

/**
 * Resolve API origin for rewrites/CSP. Prefer NEXT_PUBLIC_API_BASE_URL.
 * Soft-fallback to localhost so `next build` can evaluate config; runtime
 * server requests still fail closed via `getServerApiBaseUrl()` in production.
 */
function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (base) {
    try {
      return new URL(base).origin;
    } catch {
      // fall through
    }
  }
  return "http://localhost:4000";
}

function securityHeaders(): { key: string; value: string }[] {
  return [
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
  // during local development (Document 6 §5, SameSite=Strict). Does not invent
  // API routes — it proxies the documented Nest prefix.
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
