"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { completeOnboarding } from "@/features/auth/api/auth-api";
import { authQueryKeys } from "@/features/auth/api/query-keys";
import { queryErrorMessage } from "@/lib/api/query-error";
import {
  getOwnKycProfile,
  getOwnPayoutProfile,
  removeKycDocument,
  removeUpiQr,
  saveKycProfile,
  submitKycProfile,
  uploadKycDocument,
  uploadUpiQr,
  upsertPayoutProfile,
} from "../api/kyc-api";
import { onboardingQueryKeys } from "../api/query-keys";
import type { KycDocumentType } from "../api/types";
import {
  isKycEditable,
  resolveTeamOnboardingStep,
  type TeamOnboardingStep,
} from "../lib/resume";
import type { PersonalFormValues, IdentityFormValues, PayoutFormValues } from "../schemas/forms";
import { MirrorScreen } from "./mirror-screen";
import { OrientationScreen } from "./orientation-screen";
import { PersonalStep } from "./steps/personal-step";
import { IdentityStep } from "./steps/identity-step";
import { DocumentsStep } from "./steps/documents-step";
import { PayoutStep } from "./steps/payout-step";
import { ReviewStep } from "./steps/review-step";
import { RejectedStep, SubmittedStep } from "./steps/status-steps";

type Phase = "mirror" | "kyc" | "departing";

function LoadingState() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper px-6">
      <p className="font-mono text-[0.75rem] uppercase tracking-[0.08em] text-ink/40">
        Loading…
      </p>
    </main>
  );
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[34rem] flex-col items-start justify-center px-5 py-10">
      <h1 className="font-display text-[1.75rem] font-bold tracking-[-0.02em] text-ink">
        Something went wrong.
      </h1>
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

export function TeamOnboardingFlow({ name }: { name: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<Phase>("mirror");
  /** User/navigation override; null = derive from API resume. */
  const [manualStep, setManualStep] = useState<TeamOnboardingStep | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrUploading, setQrUploading] = useState(false);

  const kycQuery = useQuery({
    queryKey: onboardingQueryKeys.kyc(),
    queryFn: getOwnKycProfile,
    enabled: phase === "kyc",
    staleTime: 0,
    gcTime: 0,
  });

  const payoutQuery = useQuery({
    queryKey: onboardingQueryKeys.payout(),
    queryFn: getOwnPayoutProfile,
    enabled: phase === "kyc",
    staleTime: 0,
    gcTime: 0,
  });

  const kyc = kycQuery.data ?? null;
  const payout = payoutQuery.data ?? null;
  const editable = isKycEditable(kyc?.status);

  const resumedStep =
    kycQuery.isSuccess && payoutQuery.isSuccess
      ? resolveTeamOnboardingStep(kycQuery.data ?? null, payoutQuery.data ?? null)
      : null;

  const step = manualStep ?? resumedStep;

  const invalidateProfiles = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.kyc() }),
      queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.payout() }),
    ]);
  }, [queryClient]);

  const savePersonal = useMutation({
    mutationFn: (values: PersonalFormValues) => saveKycProfile(values),
    onSuccess: async () => {
      setActionError(null);
      await invalidateProfiles();
      setManualStep("identity");
    },
    onError: () => {
      setActionError("Something went wrong while saving your information.");
    },
  });

  const saveIdentity = useMutation({
    mutationFn: (values: IdentityFormValues) =>
      saveKycProfile({
        ...values,
        pan: values.pan.toUpperCase(),
      }),
    onSuccess: async () => {
      setActionError(null);
      await invalidateProfiles();
      setManualStep("documents");
    },
    onError: () => {
      setActionError("Something went wrong while saving your information.");
    },
  });

  const savePayout = useMutation({
    mutationFn: (values: PayoutFormValues) =>
      upsertPayoutProfile({
        accountHolderName: values.accountHolderName,
        bankName: values.bankName,
        accountNumber: values.accountNumber,
        ifsc: values.ifsc.toUpperCase(),
        upiId: values.upiId,
      }),
    onSuccess: async () => {
      setActionError(null);
      await invalidateProfiles();
      setManualStep("review");
    },
    onError: () => {
      setActionError("Something went wrong while saving your information.");
    },
  });

  const submitKyc = useMutation({
    mutationFn: submitKycProfile,
    onSuccess: async () => {
      setActionError(null);
      await invalidateProfiles();
      setManualStep("submitted");
    },
    onError: () => {
      setActionError("Something went wrong while submitting for verification.");
    },
  });

  const complete = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: async () => {
      setPhase("departing");
      queryClient.removeQueries({ queryKey: onboardingQueryKeys.all });
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
      window.setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 250);
    },
  });

  const goMirrorAdvance = useCallback(() => {
    setManualStep(null);
    setPhase("kyc");
  }, []);

  async function handleUploadQr(file: File) {
    setQrUploading(true);
    setQrError(null);
    try {
      // QR register requires a payout profile row — auto-save form fields if needed.
      if (!payout?.configured || !payout.id) {
        const holder = (
          document.getElementById("accountHolderName") as HTMLInputElement | null
        )?.value?.trim();
        const bank = (
          document.getElementById("bankName") as HTMLInputElement | null
        )?.value?.trim();
        const account = (
          document.getElementById("accountNumber") as HTMLInputElement | null
        )?.value?.trim();
        const ifsc = (
          document.getElementById("ifsc") as HTMLInputElement | null
        )?.value?.trim();
        const upi = (
          document.getElementById("upiId") as HTMLInputElement | null
        )?.value?.trim();
        if (!holder || !bank || !account || !ifsc || !upi) {
          setQrError("Enter bank and UPI details first, then upload your QR.");
          return;
        }
        await upsertPayoutProfile({
          accountHolderName: holder,
          bankName: bank,
          accountNumber: account,
          ifsc: ifsc.toUpperCase(),
          upiId: upi,
        });
        await invalidateProfiles();
      }
      await uploadUpiQr(file);
      await invalidateProfiles();
    } catch {
      setQrError("Upload failed. Try again.");
    } finally {
      setQrUploading(false);
    }
  }

  async function handleRemoveQr() {
    setQrError(null);
    try {
      await removeUpiQr();
      await invalidateProfiles();
    } catch {
      setQrError("Could not remove QR. Try again.");
      throw new Error("remove qr failed");
    }
  }

  if (phase === "mirror") {
    return <MirrorScreen name={name} role="TEAM_MEMBER" onAdvance={goMirrorAdvance} />;
  }

  if (phase === "departing") {
    return (
      <div className="opacity-0 transition-opacity duration-[250ms] ease-out motion-reduce:transition-none">
        <OrientationScreen role="TEAM_MEMBER" pending onEnter={() => undefined} />
      </div>
    );
  }

  if (kycQuery.isError || payoutQuery.isError) {
    return (
      <LoadError
        message="Something went wrong while loading your onboarding progress."
        onRetry={() => {
          void kycQuery.refetch();
          void payoutQuery.refetch();
        }}
      />
    );
  }

  if (kycQuery.isPending || payoutQuery.isPending || step === null) {
    return <LoadingState />;
  }

  async function handleUpload(documentType: KycDocumentType, file: File) {
    await uploadKycDocument(file, documentType);
    await invalidateProfiles();
  }

  async function handleRemove(id: string) {
    try {
      await removeKycDocument(id);
      setActionError(null);
      await invalidateProfiles();
    } catch {
      setActionError("Something went wrong while removing the document.");
      throw new Error("remove failed");
    }
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
          onBack={() => {
            setManualStep(null);
            setPhase("mirror");
          }}
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
            setManualStep("payout");
          }}
          onUpload={handleUpload}
          onRemove={handleRemove}
        />
      );

    case "payout":
      return (
        <PayoutStep
          profile={payout}
          pending={savePayout.isPending}
          error={actionError}
          qrUploading={qrUploading}
          qrError={qrError}
          onBack={() => setManualStep("documents")}
          onSave={(values) => savePayout.mutate(values)}
          onUploadQr={handleUploadQr}
          onRemoveQr={handleRemoveQr}
        />
      );

    case "review":
      return (
        <ReviewStep
          kyc={kyc}
          payout={payout}
          editable={editable}
          pending={submitKyc.isPending}
          error={actionError}
          onBack={() => setManualStep("payout")}
          onEditPersonal={() => setManualStep("personal")}
          onEditIdentity={() => setManualStep("identity")}
          onEditDocuments={() => setManualStep("documents")}
          onEditPayout={() => setManualStep("payout")}
          onSubmit={() => submitKyc.mutate()}
        />
      );

    case "submitted":
      return (
        <SubmittedStep
          submitting={submitKyc.isPending}
          onContinue={() => {
            setManualStep(null);
          }}
        />
      );

    case "orientation":
      return (
        <div>
          <OrientationScreen
            role="TEAM_MEMBER"
            pending={complete.isPending}
            onEnter={() => complete.mutate()}
          />
          {complete.isError ? (
            <p
              className="type-helper fixed bottom-8 left-0 right-0 text-center text-danger-deep"
              role="alert"
            >
              {queryErrorMessage(complete.error) || "Couldn't enter Forge. Try again."}
            </p>
          ) : null}
        </div>
      );

    default:
      return <LoadingState />;
  }
}
