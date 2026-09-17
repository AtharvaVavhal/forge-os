import { cn } from "@/lib/cn";
import { IconChevronDown } from "@/components/icons";

export function Select({
  className,
  invalid,
  children,
  ref,
  ...props
}: React.ComponentProps<"select"> & { invalid?: boolean }) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={cn(
          "font-display h-9 min-h-9 w-full appearance-none rounded-lg border bg-paper-elev px-3 pr-9 text-[length:var(--text-body-size)] text-ink",
          "hover:border-steel/30 disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-steel",
          invalid ? "border-danger-deep" : "border-steel/20",
          className
        )}
        aria-invalid={invalid || undefined}
        {...props}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-steel">
        <IconChevronDown size={16} />
      </span>
    </div>
  );
}
