"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { OnboardingStepShell } from "../onboarding-step-shell";
import type { OnboardingProgressStep } from "../motion/onboarding-progress";
import { profileFormSchema, type ProfileFormValues } from "../../schemas/forms";

/**
 * K5 onboarding redesign — Step 2: "Personal Profile", deliberately
 * minimal. `name` and `email` come straight from the Google Workspace
 * session (shown, never re-asked); the only new input is a phone number,
 * saved via the existing `saveKycProfile` (a bare `mobile` field — no
 * PAN/DOB/address, none of which this step ever touches).
 */
export function ProfileStep({
  name,
  email,
  mobile,
  pending,
  error,
  onBack,
  onSave,
  steps,
  currentIndex,
}: {
  name: string;
  email: string;
  mobile: string | null;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (values: ProfileFormValues) => void;
  steps: ReadonlyArray<OnboardingProgressStep>;
  currentIndex: number;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof ProfileFormValues, string>>>({});

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = profileFormSchema.safeParse({ mobile: form.get("mobile") });
        if (!parsed.success) {
          const next: Partial<Record<keyof ProfileFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof ProfileFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSave(parsed.data);
      }}
    >
      <OnboardingStepShell
        title="Your profile."
        subtitle="Google already told us who you are — we just need a way to reach you."
        error={error}
        onBack={onBack}
        nextLabel="Continue"
        nextType="submit"
        nextPending={pending}
        progress={{ steps, currentIndex }}
      >
        <div className="flex flex-col gap-1 rounded-[4px] border border-steel/15 bg-surface-sunken px-4 py-3">
          <span className="font-display text-[length:var(--text-body-size)] font-semibold text-ink">{name}</span>
          <span className="font-mono text-[0.75rem] text-ink/50">{email}</span>
        </div>
        <Field id="mobile" label="Mobile number" required error={errors.mobile}>
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            autoComplete="tel"
            defaultValue={mobile ?? ""}
            invalid={Boolean(errors.mobile)}
          />
        </Field>
      </OnboardingStepShell>
    </form>
  );
}
