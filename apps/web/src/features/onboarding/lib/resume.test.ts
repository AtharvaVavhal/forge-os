import { describe, expect, it } from "vitest";
import {
  isDocumentsComplete,
  isIdentityComplete,
  isKycEditable,
  isPersonalComplete,
  isPayoutComplete,
  resolveTeamOnboardingStep,
} from "./resume";
import type { KycProfile, PayoutProfile } from "../api/types";
import { maskAccountNumber, maskIfsc, maskPan, maskUpi } from "./mask";

function kyc(overrides: Partial<KycProfile> = {}): KycProfile {
  return {
    id: "kyc-1",
    status: "DRAFT",
    legalName: "Priya Sharma",
    dateOfBirth: "1995-04-12",
    mobile: "+919876543210",
    addressLine1: "12 Forge Lane",
    addressLine2: null,
    city: "Bengaluru",
    state: "Karnataka",
    postalCode: "560001",
    pan: "ABCDE1234F",
    governmentIdType: "AADHAAR",
    governmentIdNumber: "123456789012",
    submittedAt: null,
    verifiedAt: null,
    rejectedAt: null,
    rejectionReason: null,
    documents: [
      {
        id: "d1",
        documentType: "PAN_CARD",
        filename: "pan.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        status: "UPLOADED",
        createdAt: null,
        updatedAt: null,
      },
      {
        id: "d2",
        documentType: "GOVERNMENT_ID",
        filename: "aadhaar.pdf",
        mimeType: "application/pdf",
        sizeBytes: 1000,
        status: "UPLOADED",
        createdAt: null,
        updatedAt: null,
      },
    ],
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

describe("resume helpers", () => {
  it("detects personal / identity / documents / payout completeness", () => {
    expect(isPersonalComplete(null)).toBe(false);
    expect(isPersonalComplete(kyc())).toBe(true);
    expect(isPersonalComplete(kyc({ legalName: null }))).toBe(false);

    expect(isIdentityComplete(kyc())).toBe(true);
    expect(isIdentityComplete(kyc({ pan: null }))).toBe(false);

    expect(isDocumentsComplete(kyc())).toBe(true);
    expect(
      isDocumentsComplete(
        kyc({
          documents: [
            {
              id: "d1",
              documentType: "PAN_CARD",
              filename: "pan.pdf",
              mimeType: "application/pdf",
              sizeBytes: 1,
              status: "REMOVED",
              createdAt: null,
              updatedAt: null,
            },
          ],
        })
      )
    ).toBe(false);

    expect(isPayoutComplete(payout())).toBe(true);
    expect(isPayoutComplete(payout({ configured: false }))).toBe(false);
    expect(isPayoutComplete(payout({ upiId: null }))).toBe(false);
    expect(
      isPayoutComplete(
        payout({
          upiQr: { uploaded: false, filename: null, mimeType: null, sizeBytes: null },
        })
      )
    ).toBe(false);
    expect(isPayoutComplete(payout({ accountNumber: null }))).toBe(false);
  });

  it("resumes to the first incomplete step", () => {
    expect(resolveTeamOnboardingStep(null, null)).toBe("personal");
    expect(resolveTeamOnboardingStep(kyc({ legalName: null }), null)).toBe("personal");
    expect(resolveTeamOnboardingStep(kyc({ pan: null }), null)).toBe("identity");
    expect(
      resolveTeamOnboardingStep(
        kyc({
          documents: [],
        }),
        null
      )
    ).toBe("documents");
    expect(resolveTeamOnboardingStep(kyc(), null)).toBe("payout");
    expect(resolveTeamOnboardingStep(kyc(), payout())).toBe("review");
  });

  it("sends submitted / under-review / verified to orientation", () => {
    expect(resolveTeamOnboardingStep(kyc({ status: "SUBMITTED" }), payout())).toBe(
      "orientation"
    );
    expect(resolveTeamOnboardingStep(kyc({ status: "UNDER_REVIEW" }), payout())).toBe(
      "orientation"
    );
    expect(resolveTeamOnboardingStep(kyc({ status: "VERIFIED" }), payout())).toBe(
      "orientation"
    );
  });

  it("routes rejected KYC to rejected step", () => {
    expect(
      resolveTeamOnboardingStep(
        kyc({ status: "REJECTED", rejectionReason: "Blurry documents" }),
        payout()
      )
    ).toBe("rejected");
  });

  it("marks submitted states as not editable", () => {
    expect(isKycEditable("DRAFT")).toBe(true);
    expect(isKycEditable("REJECTED")).toBe(true);
    expect(isKycEditable("UNDER_REVIEW")).toBe(false);
    expect(isKycEditable("SUBMITTED")).toBe(false);
    expect(isKycEditable("VERIFIED")).toBe(false);
  });
});

describe("mask helpers", () => {
  it("masks PAN, account, UPI, and IFSC", () => {
    expect(maskPan("ABCDE1234F")).toBe("XXXXX1234F");
    expect(maskAccountNumber("123456789012")).toBe("••••••9012");
    expect(maskUpi("priya@okhdfcbank")).toBe("p•••@okhdfcbank");
    expect(maskIfsc("HDFC0001234")).toBe("HDFC••••••34");
  });
});
