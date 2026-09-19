"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";
import { OnboardingProgress, type OnboardingProgressStep } from "./motion/onboarding-progress";

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
  progress,
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
  /** Step-indicator state — omitted screens (Welcome/Success) render no progress bar. */
  progress?: { steps: ReadonlyArray<OnboardingProgressStep>; currentIndex: number };
}) {
  // Motion ownership: the enter/exit animation on this whole step lives in
  // `StepTransition` (which wraps each step case in team-onboarding-flow.tsx)
  // — this shell no longer animates itself, so it isn't double-animated when
  // both remount together on a step change.
  const headingRef = useRef<HTMLHeadingElement>(null);

  // A11y: move focus to the new step's heading on mount so screen readers
  // announce the step change and keyboard users aren't left focused on a
  // control that no longer exists (e.g. the previous step's Continue button).
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col px-5 py-10 sm:px-6 sm:py-14",
        "pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(2.5rem,env(safe-area-inset-top))]"
      )}
    >
      {progress ? (
        <OnboardingProgress steps={progress.steps} currentIndex={progress.currentIndex} className="mb-8" />
      ) : null}
      <header className="mb-8">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-[clamp(1.75rem,4.5vw,2.25rem)] font-bold tracking-[-0.02em] text-ink outline-none"
        >
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
