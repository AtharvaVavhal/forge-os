import { describe, expect, it } from "vitest";
import { isPersonalComplete, isPayoutComplete, resolveTeamOnboardingStep } from "./resume";
import type { KycProfile, PayoutProfile } from "../api/types";

function kyc(overrides: Partial<KycProfile> = {}): KycProfile {
  return {
    id: "kyc-1",
    status: "DRAFT",
    legalName: null,
    dateOfBirth: null,
    mobile: "+919876543210",
    addressLine1: null,
    addressLine2: null,
    city: null,
    state: null,
    postalCode: null,
    pan: null,
    governmentIdType: null,
    governmentIdNumber: null,
    submittedAt: null,
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    documents: [],
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

function payout(overrides: Partial<PayoutProfile> = {}): PayoutProfile {
  return {
    configured: true,
    id: "po-1",
    preferredMethod: "BANK_TRANSFER",
    accountHolderName: "Priya Sharma",
    bankName: "HDFC",
    accountNumber: "123456789012",
    ifsc: "HDFC0001234",
    upiId: "priya@okhdfcbank",
    upiQr: {
      uploaded: true,
      filename: "upi-qr.png",
      mimeType: "image/png",
      sizeBytes: 2048,
    },
    createdAt: null,
    updatedAt: null,
    ...overrides,
  };
}

describe("K5 onboarding resume helpers", () => {
  it("personal completeness is just a phone number — no legal name, DOB, address, PAN, or documents", () => {
    expect(isPersonalComplete(null)).toBe(false);
    expect(isPersonalComplete(kyc({ mobile: null }))).toBe(false);
    expect(isPersonalComplete(kyc({ mobile: "" }))).toBe(false);
    expect(isPersonalComplete(kyc())).toBe(true);
  });

  it("payout completeness is unchanged — bank fields, UPI ID, and a registered UPI QR are all required", () => {
    expect(isPayoutComplete(payout())).toBe(true);
    expect(isPayoutComplete(payout({ configured: false }))).toBe(false);
    expect(isPayoutComplete(payout({ upiId: null }))).toBe(false);
    expect(isPayoutComplete(payout({ upiQr: { uploaded: false, filename: null, mimeType: null, sizeBytes: null } }))).toBe(
      false
    );
    expect(isPayoutComplete(payout({ accountNumber: null }))).toBe(false);
  });

  it("a member with no KycProfile row and no payout profile at all resumes to 'welcome'", () => {
    expect(resolveTeamOnboardingStep(null, null)).toBe("welcome");
    expect(resolveTeamOnboardingStep(null, payout({ configured: false }))).toBe("welcome");
  });

  it("resumes to the first incomplete required step once anything is saved (never 'work', which is optional)", () => {
    expect(resolveTeamOnboardingStep(kyc({ mobile: null }), null)).toBe("profile");
    expect(resolveTeamOnboardingStep(kyc(), null)).toBe("payout");
    expect(resolveTeamOnboardingStep(kyc(), payout())).toBe("review");
  });

  it("KYC status never influences the resume target — every status behaves identically", () => {
    for (const status of ["NOT_STARTED", "DRAFT", "SUBMITTED", "UNDER_REVIEW", "VERIFIED", "REJECTED"] as const) {
      expect(resolveTeamOnboardingStep(kyc({ status }), payout())).toBe("review");
      expect(resolveTeamOnboardingStep(kyc({ status, mobile: null }), payout())).toBe("profile");
    }
  });
});
