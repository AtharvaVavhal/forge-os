import type { NextConfig } from "next";

function apiOrigin(): string {
  const base = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1";
  try {
    return new URL(base).origin;
  } catch {
    return "http://localhost:4000";
  }
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
};

export default nextConfig;
