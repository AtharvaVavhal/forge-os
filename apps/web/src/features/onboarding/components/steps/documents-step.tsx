"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { OnboardingStepShell } from "../onboarding-step-shell";
import { hasActiveDoc } from "../../lib/resume";
import type { KycDocumentType, KycProfile } from "../../api/types";
import { KYC_ALLOWED_MIME_TYPES } from "../../api/types";

type UploadState = "idle" | "uploading" | "error";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocumentSlot({
  label,
  documentType,
  profile,
  editable,
  uploadState,
  uploadError,
  onUpload,
  onRemove,
  removing,
}: {
  label: string;
  documentType: KycDocumentType;
  profile: KycProfile | null;
  editable: boolean;
  uploadState: UploadState;
  uploadError: string | null;
  onUpload: (file: File) => void;
  onRemove: (id: string) => void;
  removing: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const doc = profile?.documents.find(
    (d) => d.documentType === documentType && d.status === "UPLOADED"
  );
  const accept = KYC_ALLOWED_MIME_TYPES.join(",");
  const isUploading = uploadState === "uploading";
  const complete = Boolean(doc) && !isUploading;

  return (
    <div
      className={cn(
        "rounded-[4px] border border-steel/20 px-4 py-5",
        complete && "motion-safe:animate-[forge-onboard-fade_400ms_ease-out_both]"
      )}
    >
      {complete && doc ? (
        <>
          <p className="font-display text-[length:var(--text-label-size)] font-semibold text-ink">
            ✓ {label}
          </p>
          <p className="mt-2 truncate font-[family-name:var(--font-body)] text-[0.95rem] text-ink/75">
            {doc.filename}
          </p>
          <p className="mt-0.5 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
            {formatBytes(doc.sizeBytes)}
          </p>
          {editable ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={removing || isUploading}
                onClick={() => inputRef.current?.click()}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={removing || isUploading}
                onClick={() => onRemove(doc.id)}
              >
                Remove
              </Button>
            </div>
          ) : null}
        </>
      ) : (
        <>
          <p className="font-display text-[length:var(--text-label-size)] font-semibold uppercase tracking-[0.06em] text-ink">
            {label}
          </p>
          {editable ? (
            <button
              type="button"
              disabled={isUploading}
              onClick={() => inputRef.current?.click()}
              className={cn(
                "mt-4 flex w-full flex-col items-center justify-center gap-1.5 rounded-[4px] border border-dashed border-steel/30 px-4 py-8 text-center",
                "transition-[border-color,background-color] duration-150",
                "hover:border-ink/40 hover:bg-ink/[0.02]",
                "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
                "disabled:opacity-60"
              )}
            >
              <span className="font-display text-[length:var(--text-body-size)] font-semibold text-ink">
                {isUploading ? "Uploading…" : "Drop file here"}
              </span>
              <span className="font-[family-name:var(--font-body)] text-[0.9rem] text-ink/60">
                or choose a file
              </span>
              <span className="mt-2 font-mono text-[0.7rem] uppercase tracking-[0.06em] text-ink/45">
                PDF · JPG · PNG · WEBP
              </span>
            </button>
          ) : (
            <p className="mt-4 font-display text-[length:var(--text-helper-size)] text-steel">
              Required document missing.
            </p>
          )}
          {uploadState === "error" && uploadError ? (
            <p
              className="mt-2 font-display text-[length:var(--text-error-size)] text-danger-deep motion-safe:animate-[forge-onboard-fade_150ms_ease-out_both]"
              role="alert"
            >
              {uploadError}{" "}
              <button
                type="button"
                className="underline"
                onClick={() => inputRef.current?.click()}
              >
                Retry
              </button>
            </p>
          ) : null}
        </>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={`Upload ${label}`}
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}

export function DocumentsStep({
  profile,
  editable,
  pending,
  error,
  onBack,
  onContinue,
  onUpload,
  onRemove,
}: {
  profile: KycProfile | null;
  editable: boolean;
  pending: boolean;
  error: string | null;
  onBack: () => void;
  onContinue: () => void;
  onUpload: (documentType: KycDocumentType, file: File) => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}) {
  const [panState, setPanState] = useState<UploadState>("idle");
  const [govState, setGovState] = useState<UploadState>("idle");
  const [panError, setPanError] = useState<string | null>(null);
  const [govError, setGovError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  const canContinue =
    hasActiveDoc(profile, "PAN_CARD") &&
    hasActiveDoc(profile, "GOVERNMENT_ID") &&
    panState !== "uploading" &&
    govState !== "uploading";

  async function handleUpload(type: KycDocumentType, file: File) {
    const setState = type === "PAN_CARD" ? setPanState : setGovState;
    const setErr = type === "PAN_CARD" ? setPanError : setGovError;
    setState("uploading");
    setErr(null);
    try {
      await onUpload(type, file);
      setState("idle");
    } catch {
      setState("error");
      setErr("Upload failed. Try again.");
    }
  }

  async function handleRemove(id: string) {
    setRemoving(true);
    try {
      await onRemove(id);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <OnboardingStepShell
      title="Upload your documents."
      subtitle="These documents are used for identity verification."
      error={error}
      onBack={onBack}
      nextLabel="Continue"
      nextPending={pending}
      nextDisabled={!canContinue}
      onNext={onContinue}
    >
      <DocumentSlot
        label="PAN Card"
        documentType="PAN_CARD"
        profile={profile}
        editable={editable}
        uploadState={panState}
        uploadError={panError}
        onUpload={(file) => handleUpload("PAN_CARD", file)}
        onRemove={handleRemove}
        removing={removing}
      />
      <DocumentSlot
        label="Government ID"
        documentType="GOVERNMENT_ID"
        profile={profile}
        editable={editable}
        uploadState={govState}
        uploadError={govError}
        onUpload={(file) => handleUpload("GOVERNMENT_ID", file)}
        onRemove={handleRemove}
        removing={removing}
      />
    </OnboardingStepShell>
  );
}
