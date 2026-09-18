"use client";

import { useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { OnboardingStepShell } from "../onboarding-step-shell";
import { identityFormSchema, type IdentityFormValues } from "../../schemas/forms";
import {
  GOVERNMENT_ID_LABELS,
  KYC_GOVERNMENT_ID_TYPES,
  type KycProfile,
} from "../../api/types";

export function IdentityStep({
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
  onSave: (values: IdentityFormValues) => void;
}) {
  const [errors, setErrors] = useState<Partial<Record<keyof IdentityFormValues, string>>>({});

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = identityFormSchema.safeParse({
          pan: form.get("pan"),
          governmentIdType: form.get("governmentIdType"),
          governmentIdNumber: form.get("governmentIdNumber"),
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof IdentityFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof IdentityFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSave(parsed.data);
      }}
    >
      <OnboardingStepShell
        title="Confirm your identity."
        subtitle="PAN and government ID are required for verification."
        error={error}
        onBack={onBack}
        nextLabel="Continue"
        nextType="submit"
        nextPending={pending}
      >
        <Field id="pan" label="PAN" required error={errors.pan}>
          <Input
            id="pan"
            name="pan"
            autoComplete="off"
            spellCheck={false}
            className="uppercase"
            defaultValue={profile?.pan ?? ""}
            invalid={Boolean(errors.pan)}
          />
        </Field>
        <Field
          id="governmentIdType"
          label="Government ID type"
          required
          error={errors.governmentIdType}
        >
          <Select
            id="governmentIdType"
            name="governmentIdType"
            defaultValue={profile?.governmentIdType ?? ""}
            invalid={Boolean(errors.governmentIdType)}
            required
          >
            <option value="" disabled>
              Select type
            </option>
            {KYC_GOVERNMENT_ID_TYPES.map((type) => (
              <option key={type} value={type}>
                {GOVERNMENT_ID_LABELS[type]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          id="governmentIdNumber"
          label="Government ID number"
          required
          error={errors.governmentIdNumber}
        >
          <Input
            id="governmentIdNumber"
            name="governmentIdNumber"
            autoComplete="off"
            defaultValue={profile?.governmentIdNumber ?? ""}
            invalid={Boolean(errors.governmentIdNumber)}
          />
        </Field>
      </OnboardingStepShell>
    </form>
  );
}
