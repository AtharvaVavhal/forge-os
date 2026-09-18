export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Content-Security-Policy string, factored out of next.config.ts so the
 * connect-src allowlist (API origin, Razorpay, Google, R2 uploads) can be
 * unit tested independently of a Next.js build.
 */
export function buildContentSecurityPolicy(apiOrigin: string): string {
  return [
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
    // R2 uploads PUT directly from the browser to a per-account presigned
    // URL (https://<accountId>.r2.cloudflarestorage.com/...); the account
    // id is a backend-only secret (never exposed to apps/web), so the
    // subdomain is wildcarded rather than pinned to one hostname.
    `connect-src 'self' ${apiOrigin} https://api.razorpay.com https://lumberjack.razorpay.com https://accounts.google.com https://*.r2.cloudflarestorage.com`,
    "frame-src https://api.razorpay.com https://checkout.razorpay.com https://accounts.google.com",
    "worker-src 'self' blob:",
  ].join("; ");
}

export function buildSecurityHeaders(
  apiOrigin: string,
  nodeEnv: string | undefined
): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(self)",
    },
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy(apiOrigin) },
  ];

  // HSTS only in production builds. TLS terminators may also set this;
  // duplicate HSTS headers are acceptable (browsers use the max age).
  if (nodeEnv === "production") {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }

  return headers;
}
