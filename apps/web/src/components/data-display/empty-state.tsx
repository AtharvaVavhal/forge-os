import { cn } from "@/lib/cn";

export function EmptyState({
  kicker,
  title,
  description,
  action,
  className,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-steel/20 bg-surface-sunken px-6 py-16 text-center",
        className
      )}
    >
      {kicker ? (
        <p className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-steel">
          {kicker}
        </p>
      ) : null}
      <h1 className="font-display text-[length:var(--text-section-title-size)] font-bold leading-[var(--text-section-title-leading)] text-ink">
        {title}
      </h1>
      {description ? (
        <p className="font-display max-w-sm text-[length:var(--text-body-size)] leading-[var(--text-body-leading)] text-ink/70">
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
