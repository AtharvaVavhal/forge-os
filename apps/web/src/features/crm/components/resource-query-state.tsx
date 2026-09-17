import { EmptyState } from "@/components/data-display/empty-state";
import { ErrorState, LoadingState } from "@/components/data-display/data-states";
import { ForbiddenAlert } from "@/features/auth/components/forbidden-alert";
import { isForbiddenError } from "@/features/auth/api/classify-auth-error";
import { queryErrorMessage } from "@/lib/api/query-error";

export function ResourceQueryState({
  isPending,
  isError,
  error,
  isEmpty,
  emptyTitle,
  emptyDescription,
  children,
}: {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  isEmpty: boolean;
  emptyTitle: string;
  emptyDescription: string;
  children: React.ReactNode;
}) {
  if (isPending) return <LoadingState label="Loading records" />;
  if (isError && isForbiddenError(error)) return <ForbiddenAlert />;
  if (isError) return <ErrorState>{queryErrorMessage(error)}</ErrorState>;
  if (isEmpty) {
    return <EmptyState kicker="No records" title={emptyTitle} description={emptyDescription} />;
  }
  return <>{children}</>;
}
