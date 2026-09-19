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
  getOwnWorkProfile,
  removeUpiQr,
  saveKycProfile,
  upsertPayoutProfile,
  upsertWorkProfile,
  uploadUpiQr,
} from "../api/kyc-api";
import { onboardingQueryKeys } from "../api/query-keys";
import {
  TEAM_ONBOARDING_PROGRESS_STEPS,
  resolveTeamOnboardingStep,
  type TeamOnboardingStep,
} from "../lib/resume";
import type { PayoutFormValues, ProfileFormValues, WorkFormValues } from "../schemas/forms";
import { MirrorScreen } from "./mirror-screen";
import { OrientationScreen } from "./orientation-screen";
import { StepTransition } from "./motion/step-transition";
import { WelcomeStep } from "./steps/welcome-step";
import { ProfileStep } from "./steps/profile-step";
import { WorkStep } from "./steps/work-step";
import { PayoutStep } from "./steps/payout-step";
import { OnboardingReviewStep } from "./steps/onboarding-review-step";

type Phase = "mirror" | "onboarding" | "departing";

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

/**
 * K5 onboarding redesign — Google Workspace auth → Welcome → Personal
 * Profile → Work Profile → Payout → Review → Success → Enter Forge. No KYC
 * (PAN/government ID/documents/Finance review) anywhere in this flow —
 * that now lives in the standalone Financial Verification flow, gated at
 * first withdrawal instead of at onboarding (see `../lib/resume.ts`).
 */
export function TeamOnboardingFlow({ name, email }: { name: string; email: string }) {
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
    enabled: phase === "onboarding",
    staleTime: 0,
    gcTime: 0,
  });

  const payoutQuery = useQuery({
    queryKey: onboardingQueryKeys.payout(),
    queryFn: getOwnPayoutProfile,
    enabled: phase === "onboarding",
    staleTime: 0,
    gcTime: 0,
  });

  const workQuery = useQuery({
    queryKey: onboardingQueryKeys.work(),
    queryFn: getOwnWorkProfile,
    enabled: phase === "onboarding",
    staleTime: 0,
    gcTime: 0,
  });

  const kyc = kycQuery.data ?? null;
  const payout = payoutQuery.data ?? null;
  const work = workQuery.data ?? null;

  const resumedStep =
    kycQuery.isSuccess && payoutQuery.isSuccess ? resolveTeamOnboardingStep(kyc, payout) : null;

  const step = manualStep ?? resumedStep;
  const currentIndex = step
    ? TEAM_ONBOARDING_PROGRESS_STEPS.findIndex((entry) => entry.id === step)
    : -1;

  const invalidateProfiles = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.kyc() }),
      queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.payout() }),
      queryClient.invalidateQueries({ queryKey: onboardingQueryKeys.work() }),
    ]);
  }, [queryClient]);

  const saveProfile = useMutation({
    mutationFn: (values: ProfileFormValues) => saveKycProfile(values),
    onSuccess: async () => {
      setActionError(null);
      await invalidateProfiles();
      setManualStep("work");
    },
    onError: () => {
      setActionError("Something went wrong while saving your information.");
    },
  });

  const saveWork = useMutation({
    mutationFn: (values: WorkFormValues) => upsertWorkProfile(values),
    onSuccess: async () => {
      setActionError(null);
      await invalidateProfiles();
      setManualStep("payout");
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
    // K10: surface the backend's specific message (e.g. a bank/IFSC mismatch)
    // instead of a generic fallback, so the user knows exactly what to fix.
    onError: (error) => {
      setActionError(queryErrorMessage(error));
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
    setPhase("onboarding");
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
    } catch (error) {
      // K10: the auto-save above can fail on a bank/IFSC mismatch — surface
      // that specific message rather than a generic "upload failed".
      setQrError(queryErrorMessage(error));
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

  if (kycQuery.isError || payoutQuery.isError || workQuery.isError) {
    return (
      <LoadError
        message="Something went wrong while loading your onboarding progress."
        onRetry={() => {
          void kycQuery.refetch();
          void payoutQuery.refetch();
          void workQuery.refetch();
        }}
      />
    );
  }

  if (kycQuery.isPending || payoutQuery.isPending || workQuery.isPending || step === null) {
    return <LoadingState />;
  }

  const firstName = name.trim().split(/\s+/)[0] || name;

  switch (step) {
    case "welcome":
      return (
        <StepTransition stepKey={step}>
          <WelcomeStep
            firstName={firstName}
            onContinue={() => setManualStep("profile")}
            steps={TEAM_ONBOARDING_PROGRESS_STEPS}
            currentIndex={currentIndex}
          />
        </StepTransition>
      );

    case "profile":
      return (
        <StepTransition stepKey={step}>
          <ProfileStep
            name={name}
            email={email}
            mobile={kyc?.mobile ?? null}
            pending={saveProfile.isPending}
            error={actionError}
            onBack={() => {
              setManualStep(null);
              setPhase("mirror");
            }}
            onSave={(values) => saveProfile.mutate(values)}
            steps={TEAM_ONBOARDING_PROGRESS_STEPS}
            currentIndex={currentIndex}
          />
        </StepTransition>
      );

    case "work":
      return (
        <StepTransition stepKey={step}>
          <WorkStep
            profile={work}
            pending={saveWork.isPending}
            error={actionError}
            onBack={() => setManualStep("profile")}
            onSave={(values) => saveWork.mutate(values)}
            steps={TEAM_ONBOARDING_PROGRESS_STEPS}
            currentIndex={currentIndex}
          />
        </StepTransition>
      );

    case "payout":
      return (
        <StepTransition stepKey={step}>
          <PayoutStep
            profile={payout}
            pending={savePayout.isPending}
            error={actionError}
            qrUploading={qrUploading}
            qrError={qrError}
            onBack={() => setManualStep("work")}
            onSave={(values) => savePayout.mutate(values)}
            onUploadQr={handleUploadQr}
            onRemoveQr={handleRemoveQr}
            steps={TEAM_ONBOARDING_PROGRESS_STEPS}
            currentIndex={currentIndex}
          />
        </StepTransition>
      );

    case "review":
      return (
        <StepTransition stepKey={step}>
          <OnboardingReviewStep
            name={name}
            email={email}
            mobile={kyc?.mobile ?? null}
            work={work}
            payout={payout}
            pending={false}
            error={actionError}
            onBack={() => setManualStep("payout")}
            onEditProfile={() => setManualStep("profile")}
            onEditWork={() => setManualStep("work")}
            onEditPayout={() => setManualStep("payout")}
            onComplete={() => {
              setActionError(null);
              setManualStep("orientation");
            }}
            steps={TEAM_ONBOARDING_PROGRESS_STEPS}
            currentIndex={currentIndex}
          />
        </StepTransition>
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
