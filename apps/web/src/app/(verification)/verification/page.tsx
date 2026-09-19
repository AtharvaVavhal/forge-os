import { redirect } from "next/navigation";
import { requireWorkspaceSession } from "@/features/auth/session/require-workspace-session";
import { FinancialVerificationFlow } from "@/features/onboarding/components/financial-verification-flow";

export const dynamic = "force-dynamic";

export default async function VerificationPage() {
  const session = await requireWorkspaceSession();
  // KYC/payout are TEAM_MEMBER-specific throughout this codebase (see
  // team/kyc, team/payout-profile) — no other role has anything to verify.
  if (session.user.role !== "TEAM_MEMBER") {
    redirect("/dashboard");
  }

  return <FinancialVerificationFlow />;
}
