"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { OnboardingStepShell } from "../onboarding-step-shell";
import { personalFormSchema, type PersonalFormValues } from "../../schemas/forms";
import type { KycProfile } from "../../api/types";

export function PersonalStep({
  profile,
  pending,
  error,
  onBack,
  onSave,
}: {
  profile: KycProfile | null;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (values: PersonalFormValues) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof PersonalFormValues, string>>>({});

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = personalFormSchema.safeParse({
          legalName: form.get("legalName"),
          dateOfBirth: form.get("dateOfBirth"),
          mobile: form.get("mobile"),
          addressLine1: form.get("addressLine1"),
          addressLine2: form.get("addressLine2") || undefined,
          city: form.get("city"),
          state: form.get("state"),
          postalCode: form.get("postalCode"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof PersonalFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof PersonalFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSave(parsed.data);
      }}
    >
      <OnboardingStepShell
        title="Verify your identity."
        subtitle="A few details to establish your Forge profile."
        error={error}
        onBack={onBack}
        backLabel="Back"
        nextLabel="Continue"
        nextType="submit"
        nextPending={pending}
      >
        <Field id="legalName" label="Legal full name" required error={errors.legalName}>
          <Input
            id="legalName"
            name="legalName"
            autoComplete="name"
            defaultValue={profile?.legalName ?? ""}
            invalid={Boolean(errors.legalName)}
          />
        </Field>
        <Field id="dateOfBirth" label="Date of birth" required error={errors.dateOfBirth}>
          <Input
            id="dateOfBirth"
            name="dateOfBirth"
            type="date"
            defaultValue={profile?.dateOfBirth?.slice(0, 10) ?? ""}
            invalid={Boolean(errors.dateOfBirth)}
          />
        </Field>
        <Field id="mobile" label="Mobile number" required error={errors.mobile}>
          <Input
            id="mobile"
            name="mobile"
            type="tel"
            autoComplete="tel"
            defaultValue={profile?.mobile ?? ""}
            invalid={Boolean(errors.mobile)}
          />
        </Field>
        <Field id="addressLine1" label="Address" required error={errors.addressLine1}>
          <Input
            id="addressLine1"
            name="addressLine1"
            autoComplete="street-address"
            defaultValue={profile?.addressLine1 ?? ""}
            invalid={Boolean(errors.addressLine1)}
          />
        </Field>
        <Field id="addressLine2" label="Address line 2" error={errors.addressLine2}>
          <Input
            id="addressLine2"
            name="addressLine2"
            defaultValue={profile?.addressLine2 ?? ""}
          />
        </Field>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="city" label="City" required error={errors.city}>
            <Input
              id="city"
              name="city"
              autoComplete="address-level2"
              defaultValue={profile?.city ?? ""}
              invalid={Boolean(errors.city)}
            />
          </Field>
          <Field id="state" label="State" required error={errors.state}>
            <Input
              id="state"
              name="state"
              autoComplete="address-level1"
              defaultValue={profile?.state ?? ""}
              invalid={Boolean(errors.state)}
            />
          </Field>
        </div>
        <Field id="postalCode" label="PIN code" required error={errors.postalCode}>
          <Input
            id="postalCode"
            name="postalCode"
            autoComplete="postal-code"
            defaultValue={profile?.postalCode ?? ""}
            invalid={Boolean(errors.postalCode)}
          />
        </Field>
        <p className="font-display text-[length:var(--text-helper-size)] text-steel">
          Country: India
        </p>
      </OnboardingStepShell>
    </form>
  );
}
