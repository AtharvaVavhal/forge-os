import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lets Next.js's own build pipeline transpile the workspace packages
  // directly from TypeScript source rather than requiring them to be
  // pre-built to JS — the reason apps/web can depend on @forge/types and
  // @forge/api-client without a separate build step for either (see
  // docs/IMPLEMENTATION-PHASE-0.md for why apps/api takes a different
  // approach for cross-package types).
  transpilePackages: ["@forge/types", "@forge/api-client"],
};

export default nextConfig;
