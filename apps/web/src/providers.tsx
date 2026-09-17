"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { expireClientSession } from "@/lib/query/session-expiry";

/**
 * The one place providers are composed for the whole app (Doc B3 §1).
 * TanStack Query holds server state. No Redux/Zustand/MobX.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      queryCache: new QueryCache({
        onError: (error) => {
          if (isUnauthorizedError(error)) {
            expireClientSession(client);
          }
        },
      }),
      mutationCache: new MutationCache({
        onError: (error) => {
          if (isUnauthorizedError(error)) {
            expireClientSession(client);
          }
        },
      }),
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          retry: (failureCount, error) => {
            if (isUnauthorizedError(error)) return false;
            return failureCount < 1;
          },
        },
        mutations: {
          retry: false,
        },
      },
    });
    return client;
  });

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
