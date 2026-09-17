"use client";

import { isForbiddenError } from "../api/classify-auth-error";
import { ForbiddenAlert } from "./forbidden-alert";

export function queryForbiddenFallback(error: unknown): React.ReactNode {
  if (!isForbiddenError(error)) return null;
  return <ForbiddenAlert />;
}

export function shouldSkipRetryOnAuthz(error: unknown): boolean {
  return isForbiddenError(error);
}
