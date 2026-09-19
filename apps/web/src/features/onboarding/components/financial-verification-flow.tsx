"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { getOwnKycProfile, removeKycDocument, saveKycProfile, submitKycProfile, uploadKycDocument } from "../api/kyc-api";
import { onboardingQueryKeys } from "../api/query-keys";
import type { KycDocumentType } from "../api/types";
import { isKycEditable, resolveFinancialVerificationStep, type FinancialVerificationStep } from "../lib/financial-verification";
import type { PersonalFormValues, IdentityFormValues } from "../schemas/forms";
import { PersonalStep } from "./steps/personal-step";
import { IdentityStep } from "./steps/identity-step";
import { DocumentsStep } from "./steps/documents-step";
import { ReviewStep } from "./steps/review-step";
import { RejectedStep, SubmittedStep } from "./steps/status-steps";

const VERIFICATION_RETURN_PATH = "/settings/profile?tab=verification";

function LoadingState() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6">
      <p className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-ink/40">Loading…</p>
    </main>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col items-start justify-center px-5 py-10">
      <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.02em] text-ink">Something went wrong.</h1>
      <p className="mt-3 font-[family-name:var(--font-body)] text-ink/70">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-8 font-display text-[length:var(--text-body-size)] font-semibold text-ink underline-offset-2 hover:underline"
      >
        Try again
      </button>
    </main>
  );
}

/**
 * Standalone Financial Verification — KYC (PAN, government ID, documents,
 * Finance review), deliberately NOT part of onboarding anymore (K5
 * redesign). Reachable from Settings → Profile → Verification and from
 * the withdrawal gate's "Complete verification" CTA. TEAM_MEMBER can
 * always leave this flow without finishing it — nothing here blocks
 * dashboard access, only a future withdrawal.
 */
export function FinancialVerificationFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [manualStep, setManualStep] = useState<FinancialVerificationStep | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const kycQuery = useQuery({
    queryKey: onboardingQueryKeys.kyc(),
    queryFn: getOwnKycProfile,
    staleTime: 0,
    gcTime: 0,
  });

  const kyc = kycQuery.data ?? null;
  const editable = isKycEditable(kyc?.status);
  const resumedStep = kycQuery.isSuccess ? resolveFinancialVerificationStep(kyc) : null;
  const step = manualStep ?? resumedStep;

  const invalidateKyc = useCallback(
    () => queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.kyc() }),
    [queryClient]
  );

  const savePersonal = useMutation({
    mutationFn: (values: PersonalFormValues) => saveKycProfile(values),
    onSuccess: async () => {
      setActionError(null);
      await invalidateKyc();
      setManualStep("identity");
    },
    onError: () => setActionError("Something went wrong while saving your information."),
  });

  const saveIdentity = useMutation({
    mutationFn: (values: IdentityFormValues) => saveKycProfile({ ...values, pan: values.pan.toUpperCase() }),
    onSuccess: async () => {
      setActionError(null);
      await invalidateKyc();
      setManualStep("documents");
    },
    onError: () => setActionError("Something went wrong while saving your information."),
  });

  const submitKyc = useMutation({
    mutationFn: submitKycProfile,
    onSuccess: async () => {
      setActionError(null);
      await invalidateKyc();
      setManualStep("submitted");
    },
    onError: () => setActionError("Something went wrong while submitting for verification."),
  });

  async function handleUpload(documentType: KycDocumentType, file: File) {
    await uploadKycDocument(file, documentType);
    await invalidateKyc();
  }

  async function handleRemove(id: string) {
    try {
      await removeKycDocument(id);
      setActionError(null);
      await invalidateKyc();
    } catch {
      setActionError("Something went wrong while removing the document.");
      throw new Error("remove failed");
    }
  }

  if (kycQuery.isError) {
    return <LoadError message="Something went wrong while loading your verification progress." onRetry={() => void kycQuery.refetch()} />;
  }
  if (kycQuery.isPending || step === null) {
    return <LoadingState />;
  }

  switch (step) {
    case "rejected":
      return (
        <RejectedStep
          reason={kyc?.rejectionReason ?? null}
          onUpdate={() => {
            setActionError(null);
            setManualStep("personal");
          }}
        />
      );

    case "personal":
      return (
        <PersonalStep
          profile={kyc}
          pending={savePersonal.isPending}
          error={actionError}
          onBack={() => router.push(VERIFICATION_RETURN_PATH)}
          onSave={(values) => savePersonal.mutate(values)}
        />
      );

    case "identity":
      return (
        <IdentityStep
          profile={kyc}
          pending={saveIdentity.isPending}
          error={actionError}
          onBack={() => setManualStep("personal")}
          onSave={(values) => saveIdentity.mutate(values)}
        />
      );

    case "documents":
      return (
        <DocumentsStep
          profile={kyc}
          editable={editable}
          pending={false}
          error={actionError}
          onBack={() => setManualStep("identity")}
          onContinue={() => {
            setActionError(null);
            setManualStep("review");
          }}
          onUpload={handleUpload}
          onRemove={handleRemove}
        />
      );

    case "review":
      return (
        <ReviewStep
          kyc={kyc}
          editable={editable}
          pending={submitKyc.isPending}
          error={actionError}
          onBack={() => setManualStep("documents")}
          onEditPersonal={() => setManualStep("personal")}
          onEditIdentity={() => setManualStep("identity")}
          onEditDocuments={() => setManualStep("documents")}
          onSubmit={() => submitKyc.mutate()}
        />
      );

    case "submitted":
      return (
        <SubmittedStep
          submitting={submitKyc.isPending}
          onContinue={() => router.push(VERIFICATION_RETURN_PATH)}
        />
      );

    default:
      return <LoadingState />;
  }
}
