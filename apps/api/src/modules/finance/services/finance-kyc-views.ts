import type {
  KycDocument,
  KycDocumentStatus,
  KycDocumentType,
  KycGovernmentIdType,
  KycProfile,
  KycStatus,
  PayoutMethod,
  PayoutProfile,
  User,
} from "@prisma/client";

/** Document summary for reviewers — never includes storage_key or URLs. */
export interface FinanceKycDocumentView {
  id: string;
  documentType: KycDocumentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KycDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

/** List row — never includes PAN, IDs, bank/UPI, or document URLs. */
export interface FinanceKycListItem {
  id: string;
  status: KycStatus;
  memberName: string;
  memberEmail: string;
  submittedAt: string | null;
  verifiedAt: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FinanceKycPayoutView {
  configured: boolean;
  preferredMethod: PayoutMethod | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  upiId: string | null;
  upiQrUploaded: boolean;
}

/** Reviewer detail — dedicated DTO; never includes storage keys or signed URLs. */
export interface FinanceKycDetailView {
  id: string;
  status: KycStatus;
  member: {
    id: string;
    name: string;
    email: string;
  };
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
  documents: FinanceKycDocumentView[];
  payout: FinanceKycPayoutView;
  createdAt: string;
  updatedAt: string;
}

function toDateOnly(value: Date | null): string | null {
  if (!value) return null;
  return value.toISOString().slice(0, 10);
}

function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

function toDocumentView(doc: KycDocument): FinanceKycDocumentView {
  return {
    id: doc.id,
    documentType: doc.document_type,
    filename: doc.filename,
    mimeType: doc.mime_type,
    sizeBytes: doc.size_bytes,
    status: doc.status,
    createdAt: doc.created_at.toISOString(),
    updatedAt: doc.updated_at.toISOString(),
  };
}

export function toFinanceKycListItem(
  profile: KycProfile & { user: Pick<User, "name" | "email"> }
): FinanceKycListItem {
  return {
    id: profile.id,
    status: profile.status,
    memberName: profile.user.name,
    memberEmail: profile.user.email,
    submittedAt: toIso(profile.submitted_at),
    verifiedAt: toIso(profile.verified_at),
    rejectedAt: toIso(profile.rejected_at),
    createdAt: profile.created_at.toISOString(),
    updatedAt: profile.updated_at.toISOString(),
  };
}

export function toFinanceKycPayoutView(
  payout: PayoutProfile | null
): FinanceKycPayoutView {
  if (!payout) {
    return {
      configured: false,
      preferredMethod: null,
      accountHolderName: null,
      bankName: null,
      accountNumber: null,
      ifsc: null,
      upiId: null,
      upiQrUploaded: false,
    };
  }
  return {
    configured: true,
    preferredMethod: payout.preferred_method,
    accountHolderName: payout.account_holder_name,
    bankName: payout.bank_name,
    accountNumber: payout.account_number,
    ifsc: payout.ifsc,
    upiId: payout.upi_id,
    upiQrUploaded: Boolean(payout.upi_qr_storage_key),
  };
}

export function toFinanceKycDetailView(
  profile: KycProfile & {
    user: Pick<User, "id" | "name" | "email">;
    documents: KycDocument[];
  },
  payout: PayoutProfile | null
): FinanceKycDetailView {
  const documents = profile.documents
    .filter((d) => d.status !== "REMOVED")
    .map(toDocumentView);

  return {
    id: profile.id,
    status: profile.status,
    member: {
      id: profile.user.id,
      name: profile.user.name,
      email: profile.user.email,
    },
    legalName: profile.legal_name,
    dateOfBirth: toDateOnly(profile.date_of_birth),
    mobile: profile.mobile,
    addressLine1: profile.address_line1,
    addressLine2: profile.address_line2,
    city: profile.city,
    state: profile.state,
    postalCode: profile.postal_code,
    pan: profile.pan,
    governmentIdType: profile.government_id_type,
    governmentIdNumber: profile.government_id_number,
    submittedAt: toIso(profile.submitted_at),
    verifiedAt: toIso(profile.verified_at),
    rejectedAt: toIso(profile.rejected_at),
    rejectionReason: profile.rejection_reason,
    documents,
    payout: toFinanceKycPayoutView(payout),
    createdAt: profile.created_at.toISOString(),
    updatedAt: profile.updated_at.toISOString(),
  };
}

/** Audit-safe review payload — never includes PAN, IDs, bank, UPI, keys, or URLs. */
export function toFinanceKycReviewAuditSnapshot(input: {
  kycProfileId: string;
  status: KycStatus;
  reviewerUserId: string;
  rejectionReasonProvided?: boolean;
}): Record<string, unknown> {
  return {
    kycProfileId: input.kycProfileId,
    status: input.status,
    reviewerUserId: input.reviewerUserId,
    ...(input.rejectionReasonProvided !== undefined
      ? { rejectionReasonProvided: input.rejectionReasonProvided }
      : {}),
  };
}
