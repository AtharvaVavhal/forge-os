import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-lg bg-surface-sunken motion-safe:animate-pulse",
        className
      )}
      aria-hidden="true"
    />
  );
}
