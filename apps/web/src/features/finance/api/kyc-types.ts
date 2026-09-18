export const KYC_REVIEW_STATUSES = ["UNDER_REVIEW", "REJECTED", "VERIFIED"] as const;
export type KycReviewStatus = (typeof KYC_REVIEW_STATUSES)[number];

export const KYC_GOVERNMENT_ID_TYPES = [
  "AADHAAR",
  "PASSPORT",
  "DRIVING_LICENCE",
  "VOTER_ID",
  "OTHER",
] as const;

export type FinanceKycListItem = {
  id: string;
  status: KycReviewStatus;
  memberName: string;
  memberEmail: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceKycDocument = {
  id: string;
  documentType: "PAN_CARD" | "GOVERNMENT_ID";
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: "UPLOADED" | "REMOVED";
  createdAt: string | null;
  updatedAt: string | null;
};

export type FinanceKycDetail = {
  id: string;
  status: KycReviewStatus | string;
  member: { id: string; name: string; email: string };
  legalName: string | null;
  dateOfBirth: string | null;
  mobile: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  pan: string | null;
  governmentIdType: (typeof KYC_GOVERNMENT_ID_TYPES)[number] | null;
  governmentIdNumber: string | null;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  documents: FinanceKycDocument[];
  payout: {
    configured: boolean;
    preferredMethod: "BANK_TRANSFER" | "UPI" | null;
    accountHolderName: string | null;
    bankName: string | null;
    accountNumber: string | null;
    ifsc: string | null;
    upiId: string | null;
    upiQrUploaded: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type FinanceKycListResult = {
  items: FinanceKycListItem[];
  page: number;
  pageSize: number;
  total: number;
};
