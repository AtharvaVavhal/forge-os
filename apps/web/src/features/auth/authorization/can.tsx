"use client";

import type { ReactNode } from "react";
import type { UserRole } from "@forge/types";
import { useAuthorization } from "./authorization-context";

/**
 * Role/permission-aware render gate (UX only — backend remains authoritative).
 *
 * Default: hide children when the check fails (Doc B3 §5 "hidden action").
 * Pass a function child to disable instead of hiding.
 */
export function Can({
  permission,
  role,
  children,
  fallback = null,
}: {
  permission?: string;
  role?: UserRole | UserRole[];
  children: ReactNode | ((state: { allowed: boolean }) => ReactNode);
  fallback?: ReactNode;
}) {
  const { isAuthorized } = useAuthorization();
  const allowed = isAuthorized({ permission, role });

  if (typeof children === "function") {
    return <>{children({ allowed })}</>;
  }

  if (!allowed) return <>{fallback}</>;
  return <>{children}</>;
}
