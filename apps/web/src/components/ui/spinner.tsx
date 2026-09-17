import { cn } from "@/lib/cn";

export function Spinner({
  className,
  label = "Loading",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-steel", className)} role="status">
      <span
        className="inline-block size-4 rounded-full border-2 border-ember-deep border-t-transparent motion-safe:animate-spin"
        aria-hidden="true"
      />
      <span className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)]">
        {label}
      </span>
    </span>
  );
}
