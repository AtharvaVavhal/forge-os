import type { KycProfile, PayoutProfile } from "../api/types";

export type TeamOnboardingStep =
  | "personal"
  | "identity"
  | "documents"
  | "payout"
  | "review"
  | "submitted"
  | "rejected"
  | "orientation";

const EDITABLE: ReadonlySet<string> = new Set([
  "NOT_STARTED",
  "DRAFT",
  "REJECTED",
]);

export function isKycEditable(status: string | undefined | null): boolean {
  return !status || EDITABLE.has(status);
}

export function hasActiveDoc(
  profile: KycProfile | null,
  type: "PAN_CARD" | "GOVERNMENT_ID"
): boolean {
  return Boolean(
    profile?.documents.some((d) => d.documentType === type && d.status === "UPLOADED")
  );
}

export function isPersonalComplete(profile: KycProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.legalName?.trim() &&
      profile.dateOfBirth &&
      profile.mobile?.trim() &&
      profile.addressLine1?.trim() &&
      profile.city?.trim() &&
      profile.state?.trim() &&
      profile.postalCode?.trim()
  );
}

export function isIdentityComplete(profile: KycProfile | null): boolean {
  if (!profile) return false;
  return Boolean(
    profile.pan?.trim() &&
      profile.governmentIdType &&
      profile.governmentIdNumber?.trim()
  );
}

export function isDocumentsComplete(profile: KycProfile | null): boolean {
  return hasActiveDoc(profile, "PAN_CARD") && hasActiveDoc(profile, "GOVERNMENT_ID");
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
 * Resume to the first incomplete step from API state (source of truth).
 */
export function resolveTeamOnboardingStep(
  kyc: KycProfile | null,
  payout: PayoutProfile | null
): TeamOnboardingStep {
  if (kyc?.status === "REJECTED") {
    return "rejected";
  }

  if (
    kyc?.status === "SUBMITTED" ||
    kyc?.status === "UNDER_REVIEW" ||
    kyc?.status === "VERIFIED"
  ) {
    return "orientation";
  }

  if (!isPersonalComplete(kyc)) return "personal";
  if (!isIdentityComplete(kyc)) return "identity";
  if (!isDocumentsComplete(kyc)) return "documents";
  if (!isPayoutComplete(payout)) return "payout";
  return "review";
}
