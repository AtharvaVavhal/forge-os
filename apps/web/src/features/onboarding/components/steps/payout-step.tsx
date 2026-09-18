"use client";

import { useRef, useState } from "react";
import { Field } from "@/components/forms/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { OnboardingStepShell } from "../onboarding-step-shell";
import { payoutFormSchema, type PayoutFormValues } from "../../schemas/forms";
import {
  UPI_QR_ALLOWED_MIME_TYPES,
  type PayoutProfile,
} from "../../api/types";

function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function PayoutStep({
  profile,
  pending,
  error,
  qrUploading,
  qrError,
  onBack,
  onSave,
  onUploadQr,
  onRemoveQr,
}: {
  profile: PayoutProfile | null;
  pending: boolean;
  error: string | null;
  qrUploading: boolean;
  qrError: string | null;
  onBack: () => void;
  onSave: (values: PayoutFormValues) => void;
  onUploadQr: (file: File) => Promise<void>;
  onRemoveQr: () => Promise<void>;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [qrRequiredError, setQrRequiredError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const qrInputRef = useRef<HTMLInputElement>(null);
  const qrUploaded = Boolean(profile?.upiQr?.uploaded);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const parsed = payoutFormSchema.safeParse({
          accountHolderName: form.get("accountHolderName"),
          bankName: form.get("bankName"),
          accountNumber: form.get("accountNumber"),
          ifsc: form.get("ifsc"),
          upiId: form.get("upiId"),
        });
        if (!parsed.success) {
          const next: Record<string, string> = {};
          for (const issue of parsed.error.issues) {
            const key = issue.path[0];
            if (typeof key === "string") next[key] = issue.message;
          }
          setErrors(next);
          setQrRequiredError(qrUploaded ? null : "Required");
          return;
        }
        setErrors({});
        if (!qrUploaded) {
          setQrRequiredError("Required");
          return;
        }
        setQrRequiredError(null);
        onSave(parsed.data);
      }}
    >
      <OnboardingStepShell
        title="Set up your payouts."
        subtitle="Forge uses these details when sending your payouts."
        error={error}
        onBack={onBack}
        nextLabel="Continue"
        nextType="submit"
        nextPending={pending}
        nextDisabled={qrUploading || removing}
      >
        <section className="flex flex-col gap-4 border-b border-steel/15 pb-6">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.08em] text-ink">
              Bank Transfer
            </h2>
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
              Required
            </span>
          </div>

          <Field
            id="accountHolderName"
            label="Account holder name"
            required
            error={errors.accountHolderName}
          >
            <Input
              id="accountHolderName"
              name="accountHolderName"
              autoComplete="name"
              defaultValue={profile?.accountHolderName ?? ""}
              invalid={Boolean(errors.accountHolderName)}
            />
          </Field>
          <Field id="bankName" label="Bank name" required error={errors.bankName}>
            <Input
              id="bankName"
              name="bankName"
              defaultValue={profile?.bankName ?? ""}
              invalid={Boolean(errors.bankName)}
            />
          </Field>
          <Field
            id="accountNumber"
            label="Account number"
            required
            error={errors.accountNumber}
          >
            <Input
              id="accountNumber"
              name="accountNumber"
              autoComplete="off"
              inputMode="numeric"
              defaultValue={profile?.accountNumber ?? ""}
              invalid={Boolean(errors.accountNumber)}
            />
          </Field>
          <Field id="ifsc" label="IFSC" required error={errors.ifsc}>
            <Input
              id="ifsc"
              name="ifsc"
              autoComplete="off"
              spellCheck={false}
              className="uppercase"
              defaultValue={profile?.ifsc ?? ""}
              invalid={Boolean(errors.ifsc)}
            />
          </Field>
        </section>

        <section className="flex flex-col gap-4 pt-1">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.08em] text-ink">
              UPI
            </h2>
            <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
              Required
            </span>
          </div>

          <Field id="upiId" label="UPI ID" required error={errors.upiId}>
            <Input
              id="upiId"
              name="upiId"
              autoComplete="off"
              placeholder="name@bank"
              defaultValue={profile?.upiId ?? ""}
              invalid={Boolean(errors.upiId)}
            />
          </Field>

          <div>
            <p className="mb-2 font-display text-[length:var(--text-label-size)] font-medium text-ink">
              Personal UPI QR code{" "}
              <span className="text-danger-deep" aria-hidden>
                *
              </span>
            </p>

            {qrUploaded ? (
              <div
                className={cn(
                  "rounded-[4px] border border-steel/20 px-4 py-4",
                  "motion-safe:animate-[forge-onboard-fade_400ms_ease-out_both]"
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-display text-[length:var(--text-label-size)] font-semibold text-ink">
                      ✓ Personal UPI QR code
                    </p>
                    <p className="mt-1 truncate font-[family-name:var(--font-body)] text-[0.9rem] text-ink/70">
                      {profile?.upiQr.filename}
                      {profile?.upiQr.sizeBytes
                        ? ` · ${formatBytes(profile.upiQr.sizeBytes)}`
                        : ""}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={qrUploading || removing || pending}
                    onClick={() => qrInputRef.current?.click()}
                  >
                    Replace
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={qrUploading || removing || pending}
                    onClick={async () => {
                      setRemoving(true);
                      setQrRequiredError(null);
                      try {
                        await onRemoveQr();
                      } finally {
                        setRemoving(false);
                      }
                    }}
                  >
                    {removing ? "Removing…" : "Remove"}
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                disabled={qrUploading || pending}
                onClick={() => qrInputRef.current?.click()}
                className={cn(
                  "flex w-full flex-col items-center justify-center gap-2 rounded-[4px] border border-dashed border-steel/30 px-4 py-8 text-center",
                  "transition-[border-color,background-color] duration-150",
                  "hover:border-ink/40 hover:bg-ink/[0.02]",
                  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                  "disabled:opacity-60",
                  (qrRequiredError || qrError) && "border-danger-deep/40"
                )}
              >
                <span className="font-display text-[length:var(--text-body-size)] font-semibold text-ink">
                  {qrUploading ? "Uploading…" : "Upload QR code"}
                </span>
                <span className="font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
                  PNG · JPG · WebP
                </span>
              </button>
            )}

            <input
              ref={qrInputRef}
              type="file"
              accept={UPI_QR_ALLOWED_MIME_TYPES.join(",")}
              className="sr-only"
              aria-label="Upload personal UPI QR code"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setQrRequiredError(null);
                await onUploadQr(file);
              }}
            />

            {(qrRequiredError || qrError) && (
              <p
                className="mt-2 font-display text-[length:var(--text-error-size)] text-danger-deep motion-safe:animate-[forge-onboard-fade_150ms_ease-out_both]"
                role="alert"
              >
                {qrError ?? qrRequiredError}
              </p>
            )}
          </div>
        </section>
      </OnboardingStepShell>
    </form>
  );
}
