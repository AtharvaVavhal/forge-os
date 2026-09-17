import { cn } from "@/lib/cn";

export function Checkbox({
  className,
  label,
  ...props
}: React.ComponentProps<"input"> & { label?: string }) {
  const input = (
    <input
      type="checkbox"
      className={cn(
        "size-4 shrink-0 rounded-[3px] border border-steel/30 accent-ember-deep",
        className
      )}
      {...props}
    />
  );

  if (!label) return input;

  return (
    <label className="font-display inline-flex min-h-8 cursor-pointer items-center gap-2 text-[length:var(--text-body-size)] text-ink">
      {input}
      {label}
    </label>
  );
}
