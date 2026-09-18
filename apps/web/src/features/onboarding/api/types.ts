export const KYC_STATUSES = [
  "NOT_STARTED",
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "VERIFIED",
  "REJECTED",
] as const;

export type KycStatus = (typeof KYC_STATUSES)[number];

export const KYC_GOVERNMENT_ID_TYPES = [
  "AADHAAR",
  "PASSPORT",
  "DRIVING_LICENCE",
  "VOTER_ID",
  "OTHER",
] as const;

export type KycGovernmentIdType = (typeof KYC_GOVERNMENT_ID_TYPES)[number];

export const KYC_DOCUMENT_TYPES = ["PAN_CARD", "GOVERNMENT_ID"] as const;
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number];

export const KYC_DOCUMENT_STATUSES = ["UPLOADED", "REMOVED"] as const;
export type KycDocumentStatus = (typeof KYC_DOCUMENT_STATUSES)[number];

export const PAYOUT_METHODS = ["BANK_TRANSFER", "UPI"] as const;
export type PayoutMethod = (typeof PAYOUT_METHODS)[number];

export const KYC_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const UPI_QR_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const MAX_KYC_DOCUMENT_BYTES = 25 * 1024 * 1024;
export const MAX_UPI_QR_BYTES = 25 * 1024 * 1024;

export interface KycDocument {
  id: string;
  documentType: KycDocumentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KycDocumentStatus;
  createdAt: string | null;
  updatedAt: string | null;
}

export interface KycProfile {
  id: string;
  status: KycStatus;
  legalName: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  pan: string | null;
  governmentIdType: KycGovernmentIdType | null;
  governmentIdNumber: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  documents: KycDocument[];
  createdAt: string | null;
  updatedAt: string | null;
}

export interface UpiQrSummary {
  uploaded: boolean;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

export interface PayoutProfile {
  configured: boolean;
  id: string | null;
  preferredMethod: PayoutMethod | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  upiId: string | null;
  upiQr: UpiQrSummary;
  createdAt: string | null;
  updatedAt: string | null;
}

export type KycWritableFields = {
  legalName?: string;
  dateOfBirth?: string;
  mobile?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  pan?: string;
  governmentIdType?: KycGovernmentIdType;
  governmentIdNumber?: string;
};

/** FINAL: bank fields AND UPI ID are both required. QR is separate. */
export type UpsertPayoutBody = {
  accountHolderName: string;
  bankName: string;
  accountNumber: string;
  ifsc: string;
  upiId: string;
};

export const GOVERNMENT_ID_LABELS: Record<KycGovernmentIdType, string> = {
  AADHAAR: "Aadhaar",
  PASSPORT: "Passport",
  DRIVING_LICENCE: "Driving Licence",
  VOTER_ID: "Voter ID",
  OTHER: "Other",
};

export function emptyUpiQr(): UpiQrSummary {
  return {
    uploaded: false,
    filename: null,
    mimeType: null,
    sizeBytes: null,
  };
}

export function emptyPayoutProfile(): PayoutProfile {
  return {
    configured: false,
    id: null,
    preferredMethod: null,
    accountHolderName: null,
    bankName: null,
    accountNumber: null,
    ifsc: null,
    upiId: null,
    upiQr: emptyUpiQr(),
    createdAt: null,
    updatedAt: null,
  };
}
