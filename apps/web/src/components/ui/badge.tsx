import { cn } from "@/lib/cn";

export function Badge({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-steel/20 px-2 py-0.5 text-[length:var(--text-body-small-size)] text-steel",
        className
      )}
    >
      {children}
    </span>
  );
}
