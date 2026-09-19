import type { KycProfile, PayoutProfile } from "../api/types";

/**
 * K5 onboarding redesign — KYC status/documents no longer appear anywhere
 * in this state machine. "personal" only checks a phone number (via the
 * same `KycProfile.mobile` field KYC also uses — reused storage, not a
 * duplicated model); "work" has no completion criterion at all (it's
 * fully optional, never gates advancing). "rejected"/"submitted" are gone
 * — there is no KYC submission step in onboarding anymore (see the
 * standalone Financial Verification flow for that, post-onboarding).
 */
export type TeamOnboardingStep = "welcome" | "profile" | "work" | "payout" | "review" | "orientation";

export const TEAM_ONBOARDING_PROGRESS_STEPS: ReadonlyArray<{ id: TeamOnboardingStep; label: string }> = [
  { id: "welcome", label: "Welcome" },
  { id: "profile", label: "Profile" },
  { id: "work", label: "Work" },
  { id: "payout", label: "Payout" },
  { id: "review", label: "Review" },
];

export function isPersonalComplete(profile: KycProfile | null): boolean {
  return Boolean(profile?.mobile?.trim());
}

/** FINAL: bank fields + UPI ID + registered UPI QR are all required. */
export function isPayoutComplete(profile: PayoutProfile | null): boolean {
  if (!profile?.configured) return false;
  return Boolean(
    profile.accountHolderName?.trim() &&
      profile.bankName?.trim() &&
      profile.accountNumber?.trim() &&
      profile.ifsc?.trim() &&
      profile.upiId?.trim() &&
      profile.upiQr?.uploaded
  );
}

/**
 * Resume to the first incomplete *required* step from API state (source of
 * truth). A member with no saved progress at all lands on "welcome" (the
 * very first visit); once anything has been saved, "welcome" is never
 * shown again — a returning member resumes straight into content. "work"
 * is never a resume target — it's optional, so a returning member who
 * already has a phone number but no payout profile lands straight on
 * "payout", not "work" (they can still go Back to visit it).
 */
export function resolveTeamOnboardingStep(kyc: KycProfile | null, payout: PayoutProfile | null): TeamOnboardingStep {
  if (kyc === null && !payout?.configured) return "welcome";
  if (!isPersonalComplete(kyc)) return "profile";
  if (!isPayoutComplete(payout)) return "payout";
  return "review";
}
