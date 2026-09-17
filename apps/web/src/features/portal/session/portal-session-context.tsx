"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PortalAuthContext, PortalClientUser } from "../types";

const PortalSessionContext = createContext<PortalAuthContext | null>(null);

export function PortalSessionProvider({
  value,
  children,
}: {
  value: PortalAuthContext;
  children: ReactNode;
}) {
  return (
    <PortalSessionContext.Provider value={value}>
      {children}
    </PortalSessionContext.Provider>
  );
}

export function usePortalSession(): PortalAuthContext {
  const value = useContext(PortalSessionContext);
  if (!value) {
    throw new Error("usePortalSession must be used within an authenticated portal route.");
  }
  return value;
}

export function usePortalClientUser(): PortalClientUser {
  const { clientUser } = usePortalSession();
  return clientUser;
}
