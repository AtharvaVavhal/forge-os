"use client";

import { OnboardingStepShell } from "../onboarding-step-shell";
import type { OnboardingProgressStep } from "../motion/onboarding-progress";

/**
 * Step 1 of the K5 onboarding redesign — deliberately light (per the
 * design brief: "do not overload this screen with text"). No form, just
 * an explicit welcome + Continue, so the progress indicator and the
 * step-by-step rhythm are established before the first real input.
 */
export function WelcomeStep({
  firstName,
  onContinue,
  steps,
  currentIndex,
}: {
  firstName: string;
  onContinue: () => void;
  steps: ReadonlyArray<OnboardingProgressStep>;
  currentIndex: number;
}) {
  return (
    <OnboardingStepShell
      title={`Welcome to Forge, ${firstName}.`}
      subtitle="Your workspace is ready. You're joining the team through your Forge Google Workspace account."
      nextLabel="Continue"
      onNext={onContinue}
      progress={{ steps, currentIndex }}
    >
      <div />
    </OnboardingStepShell>
  );
}
