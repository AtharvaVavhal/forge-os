"use client";

import { cn } from "@/lib/cn";
import { ONBOARDING_ORIENTATION_COPY } from "../copy";
import type { UserRole } from "@forge/types";

export function OrientationScreen({
  role,
  pending,
  onEnter,
}: {
  role: UserRole;
  pending?: boolean;
  onEnter: () => void;
}) {
  const line = ONBOARDING_ORIENTATION_COPY[role] ?? "Everything in one system.";

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-paper px-6 text-center">
      <h1 className="font-display text-[clamp(2rem,5vw,3rem)] font-bold tracking-[-0.02em] text-ink">
        Your workspace.
      </h1>
      <p className="mt-4 max-w-md font-[family-name:var(--font-body)] text-[1.125rem] leading-relaxed text-ink/75">
        {line}
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={onEnter}
        className={cn(
          "mt-10 inline-flex min-h-12 items-center justify-center rounded-[4px] bg-ink px-12",
          "font-display text-[length:var(--text-body-size)] font-semibold uppercase tracking-[0.08em] text-paper",
          "transition-transform duration-100 motion-safe:active:scale-[0.98]",
          "disabled:opacity-60"
        )}
      >
        Enter Forge
      </button>
    </main>
  );
}
