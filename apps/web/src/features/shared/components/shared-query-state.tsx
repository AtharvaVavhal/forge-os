import { EmptyState } from "@/components/data-display/empty-state";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { ForbiddenAlert } from "@/features/auth/components/forbidden-alert";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { isNotFoundError, queryErrorMessage } from "@/lib/api/query-error";

export function SharedQueryState({
  isPending,
  isError,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  unavailableTitle = "Service is not currently available.",
  children,
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  unavailableTitle?: string;
  children: React.ReactNode;
}) {
  if (isPending) return <LoadingState label="Loading records" />;
  if (isError && isUnauthorizedError(error)) {
    return <ErrorState title="Session expired">{queryErrorMessage(error)}</ErrorState>;
  }
  if (isError && isForbiddenError(error)) return <ForbiddenAlert />;
  if (isError && isNotFoundError(error)) {
    return (
      <ErrorState title={unavailableTitle}>
        This module is specified but not mounted on this API yet. This is not an empty list.
      </ErrorState>
    );
  }
  if (isError) return <ErrorState>{queryErrorMessage(error)}</ErrorState>;
  if (isEmpty) {
    return <EmptyState kicker="No records" title={emptyTitle} description={emptyDescription} />;
  }
  return <>{children}</>;
}
