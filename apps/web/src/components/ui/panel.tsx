import { cn } from "@/lib/cn";

/** Flat section on paper — no elevated card treatment. */
export function Panel({
  children,
  className,
  kicker,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  kicker?: string;
  title?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      {title ? (
        <header>
          {kicker ? <p className="type-mono-label text-steel">{kicker}</p> : null}
          <h2 className="type-section-title text-ink">{title}</h2>
        </header>
      ) : null}
      {children}
    </section>
  );
}
