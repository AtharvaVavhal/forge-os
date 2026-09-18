import type {
  KycDocument,
  KycDocumentStatus,
  KycDocumentType,
  KycGovernmentIdType,
  KycProfile,
  KycStatus,
} from "@prisma/client";

/** Member-facing KYC document summary — never includes storage_key or URLs. */
export interface KycDocumentView {
  id: string;
  documentType: KycDocumentType;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  status: KycDocumentStatus;
  createdAt: string;
  updatedAt: string;
}

/** Member-facing KYC profile — dedicated DTO; not a raw Prisma dump. */
export interface KycProfileView {
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
  documents: KycDocumentView[];
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

export function toKycDocumentView(doc: KycDocument): KycDocumentView {
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

export function toKycProfileView(
  profile: KycProfile & { documents?: KycDocument[] }
): KycProfileView {
  const documents = (profile.documents ?? [])
    .filter((d) => d.status !== "REMOVED")
    .map(toKycDocumentView);

  return {
    id: profile.id,
    status: profile.status,
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
    createdAt: profile.created_at.toISOString(),
    updatedAt: profile.updated_at.toISOString(),
  };
}

/** Audit-safe snapshot — never includes PAN, government ID number, or document keys. */
export function toKycAuditSnapshot(profile: KycProfile): Record<string, unknown> {
  return {
    status: profile.status,
    hasLegalName: Boolean(profile.legal_name),
    hasDateOfBirth: Boolean(profile.date_of_birth),
    hasMobile: Boolean(profile.mobile),
    hasAddress: Boolean(profile.address_line1 && profile.city && profile.state && profile.postal_code),
    hasPan: Boolean(profile.pan),
    hasGovernmentId: Boolean(profile.government_id_type && profile.government_id_number),
    governmentIdType: profile.government_id_type,
  };
}
