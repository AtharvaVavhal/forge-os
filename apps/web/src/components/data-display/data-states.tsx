import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/data-display/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-live="polite" aria-label={label}>
      <Spinner label={label} />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-4 w-full max-w-md" />
      <Skeleton className="h-4 w-2/3 max-w-sm" />
    </div>
  );
}

export function TableLoadingState({ rows = 5 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-2" role="status" aria-live="polite" aria-label="Loading rows">
      {Array.from({ length: rows }).map((_, index) => (
        <Skeleton key={index} className="h-9 w-full" />
      ))}
    </div>
  );
}

export function ErrorState({
  title = "Couldn’t load this view",
  children = "Try again. If this continues, the session or the service may be unavailable.",
}: {
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <Alert tone="danger" title={title}>
      {children}
    </Alert>
  );
}

export function TableEmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <EmptyState
      kicker="No records"
      title={title}
      description={description}
      className="rounded-none border-0 bg-transparent py-12"
    />
  );
}
