/**
 * Resolve the Nest API origin for Next.js rewrites and CSP `connect-src`.
 * Production must not silently fall back to localhost.
 */
export function resolveRewriteApiOrigin(
  envValue: string | undefined,
  nodeEnv: string | undefined = process.env.NODE_ENV
): string {
  const raw = envValue?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      // fall through to fail-closed / dev default
    }
  }
  if (nodeEnv === "production") {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL must be set to an absolute URL in production (used for /api/v1 rewrite and CSP)."
    );
  }
  return "http://localhost:4000";
}
