"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

/**
 * The one place providers are composed for the whole app (Doc B3 §1). Only
 * TanStack Query exists yet — Step 6's approved server-state mechanism.
 * Toast/CommandPalette providers are added once those components exist in
 * Phase 2; no global client-state library (Redux/Zustand/MobX) is added
 * here or anywhere else, per Step 6 and Doc B3 §9.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Conservative default for Phase 0 — individual features tune
            // staleTime per entity volatility once real queries exist
            // (Doc B3 §6).
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
