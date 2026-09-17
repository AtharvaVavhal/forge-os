import { cn } from "@/lib/cn";

export function Radio({
  className,
  label,
  ...props
}: React.ComponentProps<"input"> & { label?: string }) {
  const input = (
    <input
      type="radio"
      className={cn("size-[18px] shrink-0 accent-ember-deep", className)}
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
