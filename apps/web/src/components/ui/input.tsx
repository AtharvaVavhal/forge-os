import { cn } from "@/lib/cn";

export function Input({
  className,
  invalid,
  ref,
  ...props
}: React.ComponentProps<"input"> & { invalid?: boolean }) {
  return (
    <input
      ref={ref}
      className={cn(
        "font-display w-full rounded-lg border bg-paper-elev px-3 py-2 text-[length:var(--text-body-size)] leading-[var(--text-body-leading)] text-ink",
        "placeholder:text-steel/70",
        "transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-forge)]",
        "hover:border-steel/30",
        "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-steel",
        invalid ? "border-danger-deep" : "border-steel/20",
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
