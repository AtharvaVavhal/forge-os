import { cn } from "@/lib/cn";

export function IconButton({
  label,
  className,
  inverse = false,
  ...props
}: React.ComponentProps<"button"> & { label: string; inverse?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex size-9 min-h-9 min-w-9 cursor-pointer items-center justify-center rounded-lg transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-forge)]",
        inverse ? "text-paper hover:bg-paper/[0.06]" : "text-ink hover:bg-ink/[0.04]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        className
      )}
      aria-label={label}
      {...props}
    />
  );
}
