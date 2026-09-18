"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { completeOnboarding } from "@/features/auth/api/auth-api";
import { authQueryKeys } from "@/features/auth/api/query-keys";
import type { UserRole } from "@forge/types";
import { MirrorScreen } from "./mirror-screen";
import { OrientationScreen } from "./orientation-screen";
import { TeamOnboardingFlow } from "./team-onboarding-flow";

type Step = "mirror" | "orientation" | "departing";

export function OnboardingFlow({
  name,
  role,
}: {
  name: string;
  role: UserRole;
}) {
  if (role === "TEAM_MEMBER") {
    return <TeamOnboardingFlow name={name} />;
  }

  return <StandardOnboardingFlow name={name} role={role} />;
}

function StandardOnboardingFlow({
  name,
  role,
}: {
  name: string;
  role: UserRole;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>("mirror");

  const complete = useMutation({
    mutationFn: completeOnboarding,
    onSuccess: async () => {
      setStep("departing");
      await queryClient.invalidateQueries({ queryKey: authQueryKeys.all });
      window.setTimeout(() => {
        router.replace("/dashboard");
        router.refresh();
      }, 250);
    },
  });

  const goOrientation = useCallback(() => setStep("orientation"), []);

  if (step === "mirror") {
    return <MirrorScreen name={name} role={role} onAdvance={goOrientation} />;
  }

  return (
    <div
      className={
        step === "departing"
          ? "opacity-0 transition-opacity duration-[250ms] ease-out motion-reduce:transition-none"
          : "opacity-100"
      }
    >
      <OrientationScreen
        role={role}
        pending={complete.isPending || step === "departing"}
        onEnter={() => complete.mutate()}
      />
      {complete.isError ? (
        <p className="type-helper fixed bottom-8 left-0 right-0 text-center text-danger-deep" role="alert">
          Couldn&apos;t enter Forge. Try again.
        </p>
      ) : null}
    </div>
  );
}
