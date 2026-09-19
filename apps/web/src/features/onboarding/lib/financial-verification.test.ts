import { describe, expect, it } from "vitest";
import {
  isDocumentsComplete,
  isIdentityComplete,
  isKycEditable,
  isPersonalComplete,
  resolveFinancialVerificationStep,
} from "./financial-verification";
import type { KycProfile } from "../api/types";

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

describe("Financial Verification flow helpers (standalone — post-onboarding KYC)", () => {
  it("detects personal / identity / documents completeness", () => {
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
  });

  it("resumes to the first incomplete step", () => {
    expect(resolveFinancialVerificationStep(null)).toBe("personal");
    expect(resolveFinancialVerificationStep(kyc({ legalName: null }))).toBe("personal");
    expect(resolveFinancialVerificationStep(kyc({ pan: null }))).toBe("identity");
    expect(resolveFinancialVerificationStep(kyc({ documents: [] }))).toBe("documents");
    expect(resolveFinancialVerificationStep(kyc())).toBe("review");
  });

  it("sends submitted / under-review / verified to the submitted screen", () => {
    expect(resolveFinancialVerificationStep(kyc({ status: "SUBMITTED" }))).toBe("submitted");
    expect(resolveFinancialVerificationStep(kyc({ status: "UNDER_REVIEW" }))).toBe("submitted");
    expect(resolveFinancialVerificationStep(kyc({ status: "VERIFIED" }))).toBe("submitted");
  });

  it("routes rejected KYC to the rejected step", () => {
    expect(resolveFinancialVerificationStep(kyc({ status: "REJECTED", rejectionReason: "Blurry documents" }))).toBe(
      "rejected"
    );
  });

  it("marks submitted states as not editable", () => {
    expect(isKycEditable("DRAFT")).toBe(true);
    expect(isKycEditable("REJECTED")).toBe(true);
    expect(isKycEditable("UNDER_REVIEW")).toBe(false);
    expect(isKycEditable("SUBMITTED")).toBe(false);
    expect(isKycEditable("VERIFIED")).toBe(false);
  });
});
