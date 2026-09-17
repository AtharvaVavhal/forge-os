import { GateScreen } from "@/features/onboarding/components/gate-screen";
import { redirectIfAuthenticatedOnboardingAware } from "@/features/auth/session/require-workspace-session";

export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  await redirectIfAuthenticatedOnboardingAware();
  const { token } = await params;

  return <GateScreen token={token} />;
}
