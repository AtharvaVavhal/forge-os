"use client";

import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

export function OnboardingStepShell({
  title,
  subtitle,
  children,
  error,
  backLabel,
  onBack,
  nextLabel,
  onNext,
  nextPending,
  nextDisabled,
  nextType = "button",
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  error?: string | null;
  backLabel?: string;
  onBack?: () => void;
  nextLabel?: string;
  onNext?: () => void;
  nextPending?: boolean;
  nextDisabled?: boolean;
  nextType?: "button" | "submit";
}) {
  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col px-5 py-10 sm:px-6 sm:py-14",
        "pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]",
        "motion-safe:animate-[forge-onboard-rise_220ms_ease-out_both]"
      )}
    >
      <header className="mb-8">
        <h1 className="font-display text-[clamp(1.75rem,4.5vw,2.25rem)] font-bold tracking-[-0.02em] text-ink">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-3 font-[family-name:var(--font-body)] text-[1rem] leading-relaxed text-ink/70">
            {subtitle}
          </p>
        ) : null}
      </header>

      <div className="flex flex-1 flex-col gap-5">{children}</div>

      {error ? (
        <p
          className="mt-6 text-center font-display text-[length:var(--text-error-size)] text-danger-deep motion-safe:animate-[forge-onboard-fade_150ms_ease-out_both]"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      <div
        className={cn(
          "mt-10 flex flex-col-reverse gap-3 sm:flex-row sm:items-center",
          onBack ? "sm:justify-between" : "sm:justify-end"
        )}
      >
        {onBack ? (
          <Button type="button" variant="ghost" onClick={onBack} disabled={nextPending}>
            {backLabel ?? "Back"}
          </Button>
        ) : (
          <span />
        )}
        {nextLabel ? (
          <Button
            type={nextType}
            variant="dark"
            loading={nextPending}
            disabled={nextDisabled || nextPending}
            onClick={nextType === "button" ? onNext : undefined}
          >
            {nextLabel}
          </Button>
        ) : null}
      </div>
    </main>
  );
}
