"use client";

import { cn } from "@/lib/cn";

const sizeClass = {
  sm: "h-8 min-h-8 px-3 text-[length:var(--text-button-size)]",
  md: "h-9 min-h-9 px-4 text-[length:var(--text-button-size)]",
  lg: "h-11 min-h-11 px-6 text-[length:var(--text-button-size)]",
} as const;

const variantClass = {
  primary:
    "bg-ember-deep text-paper hover:bg-ember-deep/90 disabled:hover:bg-ember-deep",
  secondary:
    "border border-steel/20 bg-transparent text-ink hover:bg-ink/[0.04] disabled:hover:bg-transparent",
  ghost: "bg-transparent text-ink hover:bg-ink/[0.04] disabled:hover:bg-transparent",
  inverse:
    "border border-paper/25 bg-transparent text-paper hover:bg-paper/[0.06] disabled:hover:bg-transparent",
  destructive:
    "border border-danger-deep text-danger-deep hover:bg-danger-soft disabled:hover:bg-transparent",
} as const;

export function Button({
  children,
  className,
  variant = "primary",
  size = "md",
  loading = false,
  disabled,
  type = "button",
  ...props
}: React.ComponentProps<"button"> & {
  variant?: keyof typeof variantClass;
  size?: keyof typeof sizeClass;
  loading?: boolean;
}) {
  return (
    <button
      type={type}
      className={cn(
        "font-display inline-flex cursor-pointer items-center justify-center gap-2 rounded-full font-semibold transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-forge)] motion-safe:hover:enabled:scale-[1.02] motion-safe:active:enabled:scale-[0.98]",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
        sizeClass[size],
        variantClass[variant],
        (disabled || loading) && "cursor-not-allowed opacity-60",
        className
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <ButtonSpinner /> : null}
      {children}
    </button>
  );
}

function ButtonSpinner() {
  return (
    <span
      className="inline-block size-3.5 rounded-full border-2 border-current border-t-transparent motion-safe:animate-spin"
      aria-hidden="true"
    />
  );
}
