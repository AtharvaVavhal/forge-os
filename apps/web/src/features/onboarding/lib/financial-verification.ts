import type { KycProfile } from "../api/types";

/**
 * State machine for the standalone Financial Verification flow (KYC —
 * PAN, government ID, documents, Finance review) — reachable from the
 * Verification tab and from the withdrawal gate's "Complete verification"
 * CTA, entirely independent of onboarding (see `lib/resume.ts`, which no
 * longer references KYC at all). This is exactly the state machine
 * onboarding used to own before the K5 redesign, moved here unchanged.
 */
export type FinancialVerificationStep = "personal" | "identity" | "documents" | "review" | "submitted" | "rejected";

const EDITABLE: ReadonlySet<string> = new Set(["NOT_STARTED", "DRAFT", "REJECTED"]);

export function isKycEditable(status: string | undefined | null): boolean {
  return !status || EDITABLE.has(status);
}

export function hasActiveDoc(profile: KycProfile | null, type: "PAN_CARD" | "GOVERNMENT_ID"): boolean {
  return Boolean(profile?.documents.some((d) => d.documentType === type && d.status === "UPLOADED"));
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
  return Boolean(profile.pan?.trim() && profile.governmentIdType && profile.governmentIdNumber?.trim());
}

export function isDocumentsComplete(profile: KycProfile | null): boolean {
  return hasActiveDoc(profile, "PAN_CARD") && hasActiveDoc(profile, "GOVERNMENT_ID");
}

/** Resume to the first incomplete step from API state (source of truth). */
export function resolveFinancialVerificationStep(kyc: KycProfile | null): FinancialVerificationStep {
  if (kyc?.status === "REJECTED") return "rejected";
  if (kyc?.status === "SUBMITTED" || kyc?.status === "UNDER_REVIEW" || kyc?.status === "VERIFIED") {
    return "submitted";
  }
  if (!isPersonalComplete(kyc)) return "personal";
  if (!isIdentityComplete(kyc)) return "identity";
  if (!isDocumentsComplete(kyc)) return "documents";
  return "review";
}
