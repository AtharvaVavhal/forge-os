"use client";

import { Alert } from "@/components/feedback/alert";

/**
 * Inline treatment for an unexpected 403 on a mutation/query the UI thought
 * was allowed (Doc B3 §4). Distinct from the route-level forbidden page.
 */
export function ForbiddenAlert({
  message = "You don’t have permission to do this.",
}: {
  message?: string;
}) {
  return (
    <Alert tone="danger" title="Permission required">
      {message}
    </Alert>
  );
}
