"use client";

import { useState, type KeyboardEvent } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { OnboardingStepShell } from "../onboarding-step-shell";
import type { OnboardingProgressStep } from "../motion/onboarding-progress";
import { workFormSchema, type WorkFormValues } from "../../schemas/forms";
import type { WorkProfile } from "../../api/types";

const MAX_SKILLS = 20;

function SkillChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper-elev px-3 py-1",
        "font-display text-[0.8rem] text-ink",
        "motion-safe:animate-[forge-onboard-rise_180ms_ease-out_both]"
      )}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${label}`}
        className="text-ink/40 transition-colors duration-100 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        ×
      </button>
    </span>
  );
}

/**
 * K5 onboarding redesign — Step 3: "Work Profile". Every field optional,
 * never gated on (see `WorkFormValues`) — kept deliberately light so this
 * never feels like HR data entry.
 */
export function WorkStep({
  profile,
  pending,
  error,
  onBack,
  onSave,
  steps,
  currentIndex,
}: {
  profile: WorkProfile | null;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onSave: (values: WorkFormValues) => void;
  steps: ReadonlyArray<OnboardingProgressStep>;
  currentIndex: number;
}) {
  const [skills, setSkills] = useState<string[]>(profile?.skills ?? []);
  const [skillInput, setSkillInput] = useState("");
  const [errors, setErrors] = useState<Partial<Record<keyof WorkFormValues, string>>>({});

  function addSkill() {
    const value = skillInput.trim();
    if (!value || skills.length >= MAX_SKILLS || skills.includes(value)) {
      setSkillInput("");
      return;
    }
    setSkills((current) => [...current, value]);
    setSkillInput("");
  }

  function onSkillKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      addSkill();
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = workFormSchema.safeParse({
          jobTitle: form.get("jobTitle") || undefined,
          primaryArea: form.get("primaryArea") || undefined,
          skills,
          bio: form.get("bio") || undefined,
        });
        if (!parsed.success) {
          const next: Partial<Record<keyof WorkFormValues, string>> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key as keyof WorkFormValues] = issue.message;
          }
          setErrors(next);
          return;
        }
        setErrors({});
        onSave(parsed.data);
      }}
    >
      <OnboardingStepShell
        title="What you do."
        subtitle="A little context for the rest of the team — all optional."
        error={error}
        onBack={onBack}
        nextLabel="Continue"
        nextType="submit"
        nextPending={pending}
        progress={{ steps, currentIndex }}
      >
        <Field id="jobTitle" label="Job title" error={errors.jobTitle}>
          <Input id="jobTitle" name="jobTitle" defaultValue={profile?.jobTitle ?? ""} placeholder="Software Engineer" />
        </Field>
        <Field id="primaryArea" label="Primary area" error={errors.primaryArea}>
          <Input id="primaryArea" name="primaryArea" defaultValue={profile?.primaryArea ?? ""} placeholder="Frontend" />
        </Field>
        <Field id="skillInput" label="Skills" hint="Press Enter to add">
          <div className="flex flex-col gap-2">
            {skills.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {skills.map((skill) => (
                  <SkillChip key={skill} label={skill} onRemove={() => setSkills((current) => current.filter((s) => s !== skill))} />
                ))}
              </div>
            ) : null}
            <div className="flex gap-2">
              <Input
                id="skillInput"
                value={skillInput}
                onChange={(event) => setSkillInput(event.target.value)}
                onKeyDown={onSkillKeyDown}
                placeholder="React, TypeScript, …"
                disabled={skills.length >= MAX_SKILLS}
              />
              <Button type="button" variant="secondary" onClick={addSkill} disabled={skills.length >= MAX_SKILLS}>
                Add
              </Button>
            </div>
          </div>
        </Field>
        <Field id="bio" label="Short bio" error={errors.bio}>
          <Textarea id="bio" name="bio" rows={3} defaultValue={profile?.bio ?? ""} placeholder="A sentence or two about you." />
        </Field>
      </OnboardingStepShell>
    </form>
  );
}
