"use client";

import { cn } from "@/lib/cn";
import { IconCheck } from "@/components/icons";

export interface OnboardingProgressStep {
  id: string;
  label: string;
}

/**
 * Polished, functional step indicator — communicates actual onboarding
 * state (not decorative): each circle is upcoming/current/complete based
 * on `currentIndex`, and the connecting line's width animates to track
 * progress. Desktop shows step labels; mobile collapses to a compact
 * "N / total" readout plus the same animated bar, so the indicator never
 * competes for width with the Continue/Back controls on a small screen.
 */
export function OnboardingProgress({
  steps,
  currentIndex,
  className,
}: {
  steps: ReadonlyArray<OnboardingProgressStep>;
  currentIndex: number;
  className?: string;
}) {
  const total = steps.length;
  const current = steps[currentIndex];
  const pct = total > 1 ? (currentIndex / (total - 1)) * 100 : 0;

  return (
    <div className={cn("flex flex-col gap-3", className)} role="group" aria-label="Onboarding progress">
      {/* Mobile: compact counter + bar. */}
      <div className="flex items-center gap-3 sm:hidden">
        <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink/50">
          {String(currentIndex + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}
        </span>
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-ink/10">
          <div
            className="h-full rounded-full bg-ink transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${pct}%` }}
          />
        </div>
        {current ? (
          <span className="font-mono text-[0.7rem] uppercase tracking-[0.08em] text-ink/70">{current.label}</span>
        ) : null}
      </div>

      {/* Desktop/tablet: full step list with connecting line. */}
      <ol className="hidden items-center sm:flex">
        {steps.map((step, index) => {
          const complete = index < currentIndex;
          const isCurrent = index === currentIndex;
          return (
            <li key={step.id} className="flex flex-1 items-center last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className={cn(
                    "flex size-6 items-center justify-center rounded-full border font-mono text-[0.65rem] transition-colors duration-200",
                    complete && "border-ink bg-ink text-paper",
                    isCurrent && "border-ink bg-paper text-ink",
                    !complete && !isCurrent && "border-ink/25 bg-paper text-ink/40"
                  )}
                >
                  {complete ? (
                    <IconCheck size={16} className="motion-safe:animate-[forge-onboard-check_600ms_ease-out_both]" />
                  ) : (
                    index + 1
                  )}
                </span>
                <span
                  className={cn(
                    "font-mono text-[0.65rem] uppercase tracking-[0.06em] whitespace-nowrap",
                    isCurrent ? "text-ink" : "text-ink/40"
                  )}
                >
                  {step.label}
                </span>
              </div>
              {index < steps.length - 1 ? (
                <div className="mx-2 h-px flex-1 bg-ink/15">
                  <div
                    className="h-px bg-ink transition-[width] duration-300 ease-out motion-reduce:transition-none"
                    style={{ width: complete ? "100%" : "0%" }}
                  />
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
