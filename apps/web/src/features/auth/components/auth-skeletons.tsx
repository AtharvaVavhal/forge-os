import { Skeleton } from "@/components/ui/skeleton";

export function AuthSessionSkeleton({
  label = "Checking your session",
}: {
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-4" role="status" aria-live="polite" aria-label={label}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-full max-w-lg" />
      <Skeleton className="h-4 w-2/3 max-w-md" />
    </div>
  );
}

export function LoginFormSkeleton() {
  return (
    <div className="flex w-full flex-col gap-4" role="status" aria-live="polite" aria-label="Loading sign-in">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full rounded-full" />
    </div>
  );
}
