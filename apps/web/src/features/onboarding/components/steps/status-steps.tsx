"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function SubmittedStep({
  onContinue,
  submitting,
}: {
  onContinue: () => void;
  submitting?: boolean;
}) {
  if (submitting) {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col items-start justify-center px-5 py-10 sm:px-6 sm:py-14">
        <p className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-ink/45" role="status">
          Submitting…
        </p>
      </main>
    );
  }

  return (
    <main
      className={cn(
        "mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col items-start justify-center px-5 py-10 sm:px-6 sm:py-14",
        "motion-safe:animate-[forge-onboard-fade_600ms_ease-out_both]"
      )}
    >
      <div
        className={cn(
          "mb-6 flex h-12 w-12 items-center justify-center rounded-full border border-ink/20",
          "motion-safe:animate-[forge-onboard-check_600ms_ease-out_both]"
        )}
        aria-hidden
      >
        <span className="font-display text-xl text-ink">✓</span>
      </div>
      <h1 className="font-display text-[clamp(1.75rem,4.5vw,2.25rem)] font-bold tracking-[-0.02em] text-ink">
        Verification submitted.
      </h1>
      <p className="mt-3 max-w-md font-[family-name:var(--font-body)] text-[1rem] leading-relaxed text-ink/70">
        Your KYC details are now under review.
      </p>
      <Button type="button" variant="dark" className="mt-10" onClick={onContinue}>
        Continue
      </Button>
    </main>
  );
}

export function RejectedStep({
  reason,
  onUpdate,
}: {
  reason: string | null;
  onUpdate: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col items-start justify-center px-5 py-10 sm:px-6 sm:py-14 motion-safe:animate-[forge-onboard-rise_220ms_ease-out_both]">
      <h1 className="font-display text-[clamp(1.75rem,4.5vw,2.25rem)] font-bold tracking-[-0.02em] text-ink">
        Your verification needs an update.
      </h1>
      {reason ? (
        <p className="mt-3 font-[family-name:var(--font-body)] text-[1rem] leading-relaxed text-ink/70">
          {reason}
        </p>
      ) : (
        <p className="mt-3 font-[family-name:var(--font-body)] text-[1rem] leading-relaxed text-ink/70">
          Please review your details and documents, then submit again.
        </p>
      )}
      <Button type="button" variant="dark" className="mt-10" onClick={onUpdate}>
        Update KYC
      </Button>
    </main>
  );
}
