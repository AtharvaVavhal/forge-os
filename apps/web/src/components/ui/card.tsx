import { cn } from "@/lib/cn";

export function Card({
  children,
  className,
  padding = "comfortable",
  ...props
}: React.ComponentProps<"section"> & {
  padding?: "compact" | "comfortable" | "none";
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-steel/15 bg-paper-elev",
        padding === "compact" && "p-[var(--space-card-padding-compact)]",
        padding === "comfortable" && "p-[var(--space-card-padding-comfortable)]",
        className
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  kicker,
  title,
  description,
  action,
}: {
  kicker?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        {kicker ? <p className="type-mono-label text-steel">{kicker}</p> : null}
        <h2 className="type-subsection text-ink">{title}</h2>
        {description ? <p className="type-helper mt-1 text-steel">{description}</p> : null}
      </div>
      {action}
    </header>
  );
}