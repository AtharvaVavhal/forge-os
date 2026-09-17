"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { InternalAuthContext } from "../types";
import {
  hasPermission,
  hasRole,
  isAuthorized,
  type AuthorizationQuery,
} from "./authorization";

const AuthzContext = createContext<InternalAuthContext | null>(null);

export function AuthorizationProvider({
  value,
  children,
}: {
  value: InternalAuthContext;
  children: ReactNode;
}) {
  return <AuthzContext.Provider value={value}>{children}</AuthzContext.Provider>;
}

export function useAuthContext(): InternalAuthContext {
  const value = useContext(AuthzContext);
  if (!value) {
    throw new Error("useAuthContext must be used within the authenticated workspace.");
  }
  return value;
}

export function useAuthorization() {
  const context = useAuthContext();

  return {
    user: context.user,
    role: context.user.role,
    permissions: context.permissions,
    hasRole: (role: Parameters<typeof hasRole>[1]) => hasRole(context, role),
    can: (permission: string) => hasPermission(context, permission),
    isAuthorized: (query: AuthorizationQuery) => isAuthorized(context, query),
  };
}
