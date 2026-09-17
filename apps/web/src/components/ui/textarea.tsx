import { cn } from "@/lib/cn";

export function Textarea({
  className,
  invalid,
  ref,
  ...props
}: React.ComponentProps<"textarea"> & { invalid?: boolean }) {
  return (
    <textarea
      ref={ref}
      className={cn(
        "font-display min-h-24 w-full resize-y rounded-lg border bg-paper-elev px-3 py-2 text-[length:var(--text-body-size)] leading-[var(--text-body-leading)] text-ink",
        "placeholder:text-steel/70 hover:border-steel/30",
        "disabled:cursor-not-allowed disabled:bg-surface-sunken disabled:text-steel",
        invalid ? "border-danger-deep" : "border-steel/20",
        className
      )}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}
