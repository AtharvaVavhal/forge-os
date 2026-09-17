import { OnboardingFlow } from "@/features/onboarding/components/onboarding-flow";
import { requireOnboardingSession } from "@/features/auth/session/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const session = await requireOnboardingSession();

  return <OnboardingFlow name={session.user.name} role={session.user.role} />;
}
