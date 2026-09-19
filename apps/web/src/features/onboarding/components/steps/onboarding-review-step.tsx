"use client";

import { OnboardingStepShell } from "../onboarding-step-shell";
import type { OnboardingProgressStep } from "../motion/onboarding-progress";
import { maskAccountNumber, maskIfsc, maskUpi } from "../../lib/mask";
import type { PayoutProfile, WorkProfile } from "../../api/types";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="font-mono text-[0.75rem] uppercase tracking-[0.06em] text-ink/50">{label}</dt>
      <dd className="font-[family-name:var(--font-body)] text-[0.95rem] text-ink sm:text-right">{value}</dd>
    </div>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <section className="border-b border-steel/15 pb-5 last:border-b-0 last:pb-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.06em] text-ink">
          {title}
        </h2>
        <button
          type="button"
          onClick={onEdit}
          className="font-display text-[length:var(--text-helper-size)] font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Edit
        </button>
      </div>
      <dl className="flex flex-col gap-2.5">{children}</dl>
    </section>
  );
}

/**
 * K5 onboarding redesign — Step 5: "Review". Deliberately light — no PAN,
 * no government ID, nothing KYC-shaped. "Complete setup" moves straight to
 * `completeOnboarding` (no KYC submission step exists in this flow anymore).
 */
export function OnboardingReviewStep({
  name,
  email,
  mobile,
  work,
  payout,
  pending,
  error,
  onBack,
  onEditProfile,
  onEditWork,
  onEditPayout,
  onComplete,
  steps,
  currentIndex,
}: {
  name: string;
  email: string;
  mobile: string | null;
  work: WorkProfile | null;
  payout: PayoutProfile | null;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onEditProfile: () => void;
  onEditWork: () => void;
  onEditPayout: () => void;
  onComplete: () => void;
  steps: ReadonlyArray<OnboardingProgressStep>;
  currentIndex: number;
}) {
  return (
    <OnboardingStepShell
      title="Review your details."
      subtitle="Everything looks good?"
      error={error}
      onBack={onBack}
      nextLabel="Complete setup"
      nextPending={pending}
      onNext={onComplete}
      progress={{ steps, currentIndex }}
    >
      <Section title="Personal" onEdit={onEditProfile}>
        <SummaryRow label="Name" value={name} />
        <SummaryRow label="Email" value={email} />
        <SummaryRow label="Mobile" value={mobile ?? "—"} />
      </Section>

      <Section title="Work" onEdit={onEditWork}>
        <SummaryRow label="Job title" value={work?.jobTitle ?? "—"} />
        <SummaryRow label="Primary area" value={work?.primaryArea ?? "—"} />
        <SummaryRow label="Skills" value={work?.skills.length ? work.skills.join(", ") : "—"} />
      </Section>

      <Section title="Payout" onEdit={onEditPayout}>
        <SummaryRow label="Bank" value={payout?.bankName ?? "—"} />
        <SummaryRow label="Account" value={maskAccountNumber(payout?.accountNumber)} />
        <SummaryRow label="IFSC" value={maskIfsc(payout?.ifsc)} />
        <SummaryRow label="UPI" value={maskUpi(payout?.upiId)} />
      </Section>
    </OnboardingStepShell>
  );
}
