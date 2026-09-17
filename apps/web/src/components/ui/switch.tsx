"use client";

import { cn } from "@/lib/cn";

export function Switch({
  checked,
  onCheckedChange,
  disabled,
  label,
  id,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out-forge)]",
        checked ? "bg-ember-deep" : "bg-steel/30",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 size-4 rounded-full bg-paper-elev transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-forge)]",
          checked && "translate-x-4"
        )}
      />
    </button>
  );
}
