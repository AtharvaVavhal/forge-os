"use client";

import { OnboardingStepShell } from "../onboarding-step-shell";
import { GOVERNMENT_ID_LABELS, type KycProfile, type PayoutProfile } from "../../api/types";
import { maskAccountNumber, maskIdNumber, maskIfsc, maskPan, maskUpi } from "../../lib/mask";

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
      <dt className="font-mono text-[0.75rem] uppercase tracking-[0.06em] text-ink/50">
        {label}
      </dt>
      <dd className="font-[family-name:var(--font-body)] text-[0.95rem] text-ink sm:text-right">
        {value}
      </dd>
    </div>
  );
}

function Section({
  title,
  onEdit,
  editable,
  children,
}: {
  title: string;
  onEdit?: () => void;
  editable: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-steel/15 pb-5 last:border-b-0 last:pb-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.06em] text-ink">
          {title}
        </h2>
        {editable && onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            className="font-display text-[length:var(--text-helper-size)] font-semibold text-ink underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Edit
          </button>
        ) : null}
      </div>
      <dl className="flex flex-col gap-2.5">{children}</dl>
    </section>
  );
}

export function ReviewStep({
  kyc,
  payout,
  editable,
  pending,
  error,
  onBack,
  onEditPersonal,
  onEditIdentity,
  onEditDocuments,
  onEditPayout,
  onSubmit,
}: {
  kyc: KycProfile | null;
  payout: PayoutProfile | null;
  editable: boolean;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onEditPersonal: () => void;
  onEditIdentity: () => void;
  onEditDocuments: () => void;
  onEditPayout: () => void;
  onSubmit: () => void;
}) {
  function editIdentity() {
    // Legal name lives on personal; PAN/gov ID on identity — start at personal.
    onEditPersonal();
    void onEditIdentity;
  }

  const panDoc = kyc?.documents.find(
    (d) => d.documentType === "PAN_CARD" && d.status === "UPLOADED"
  );
  const govDoc = kyc?.documents.find(
    (d) => d.documentType === "GOVERNMENT_ID" && d.status === "UPLOADED"
  );

  return (
    <OnboardingStepShell
      title="Review your details."
      subtitle="Everything looks good?"
      error={error}
      onBack={onBack}
      nextLabel="Submit for verification"
      nextPending={pending}
      onNext={onSubmit}
    >
      <Section title="Identity" editable={editable} onEdit={editIdentity}>
        <SummaryRow label="Legal name" value={kyc?.legalName ?? "—"} />
        <SummaryRow label="PAN" value={maskPan(kyc?.pan)} />
        <SummaryRow
          label="Government ID"
          value={
            kyc?.governmentIdType
              ? `${GOVERNMENT_ID_LABELS[kyc.governmentIdType]} · ${maskIdNumber(kyc.governmentIdNumber)}`
              : maskIdNumber(kyc?.governmentIdNumber)
          }
        />
      </Section>

      <Section title="Documents" editable={editable} onEdit={onEditDocuments}>
        <SummaryRow label="PAN Card" value={panDoc ? "✓ Uploaded" : "Missing"} />
        <SummaryRow label="Government ID" value={govDoc ? "✓ Uploaded" : "Missing"} />
      </Section>

      <Section title="Bank Transfer" editable={editable} onEdit={onEditPayout}>
        <SummaryRow label="Account holder" value={payout?.accountHolderName ?? "—"} />
        <SummaryRow label="Bank" value={payout?.bankName ?? "—"} />
        <SummaryRow
          label="Account"
          value={maskAccountNumber(payout?.accountNumber)}
        />
        <SummaryRow label="IFSC" value={maskIfsc(payout?.ifsc)} />
      </Section>

      <Section title="UPI" editable={editable} onEdit={onEditPayout}>
        <SummaryRow label="UPI ID" value={maskUpi(payout?.upiId)} />
        <SummaryRow
          label="QR Code"
          value={payout?.upiQr?.uploaded ? "✓ Uploaded" : "Missing"}
        />
      </Section>
    </OnboardingStepShell>
  );
}
