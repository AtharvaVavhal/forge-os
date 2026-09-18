import {
  asInt,
  asIsoDate,
  asString,
  isRecord,
  readField,
  unwrapData,
} from "@/lib/api/parse-json";
import {
  KYC_DOCUMENT_STATUSES,
  KYC_DOCUMENT_TYPES,
  KYC_GOVERNMENT_ID_TYPES,
  KYC_STATUSES,
  PAYOUT_METHODS,
  type KycDocument,
  type KycDocumentStatus,
  type KycDocumentType,
  type KycGovernmentIdType,
  type KycProfile,
  type KycStatus,
  type PayoutMethod,
  type PayoutProfile,
} from "./types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseDocument(value: unknown): KycDocument | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const documentType = inSet(
    readField(value, "documentType", "document_type"),
    KYC_DOCUMENT_TYPES
  );
  const filename = asString(value.filename);
  const status = inSet(value.status, KYC_DOCUMENT_STATUSES);
  if (!id || !documentType || !filename || !status) return null;
  return {
    id,
    documentType: documentType as KycDocumentType,
    filename,
    mimeType: asString(readField(value, "mimeType", "mime_type")) ?? "",
    sizeBytes: asInt(readField(value, "sizeBytes", "size_bytes")) ?? 0,
    status: status as KycDocumentStatus,
    createdAt: asIsoDate(readField(value, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(value, "updatedAt", "updated_at")),
  };
}

export function parseKycDocument(payload: unknown): KycDocument | null {
  const node = isRecord(unwrapData(payload))
    ? (unwrapData(payload) as Record<string, unknown>)
    : isRecord(payload)
      ? payload
      : null;
  return parseDocument(node);
}

export function parseKycProfile(payload: unknown): KycProfile | null {
  const node = isRecord(unwrapData(payload))
    ? (unwrapData(payload) as Record<string, unknown>)
    : isRecord(payload)
      ? payload
      : null;
  if (!node) return null;
  const id = asString(node.id);
  const status = inSet(node.status, KYC_STATUSES);
  if (!id || !status) return null;

  const docsRaw = Array.isArray(node.documents) ? node.documents : [];
  const documents = docsRaw
    .map(parseDocument)
    .filter((d): d is KycDocument => d !== null);

  return {
    id,
    status: status as KycStatus,
    legalName: asString(readField(node, "legalName", "legal_name")) ?? null,
    dateOfBirth: asString(readField(node, "dateOfBirth", "date_of_birth")) ?? null,
    mobile: asString(node.mobile) ?? null,
    addressLine1: asString(readField(node, "addressLine1", "address_line1")) ?? null,
    addressLine2: asString(readField(node, "addressLine2", "address_line2")) ?? null,
    city: asString(node.city) ?? null,
    state: asString(node.state) ?? null,
    postalCode: asString(readField(node, "postalCode", "postal_code")) ?? null,
    pan: asString(node.pan) ?? null,
    governmentIdType: inSet(
      readField(node, "governmentIdType", "government_id_type"),
      KYC_GOVERNMENT_ID_TYPES
    ) as KycGovernmentIdType | null,
    governmentIdNumber:
      asString(readField(node, "governmentIdNumber", "government_id_number")) ?? null,
    submittedAt: asIsoDate(readField(node, "submittedAt", "submitted_at")),
    verifiedAt: asIsoDate(readField(node, "verifiedAt", "verified_at")),
    rejectedAt: asIsoDate(readField(node, "rejectedAt", "rejected_at")),
    rejectionReason:
      asString(readField(node, "rejectionReason", "rejection_reason")) ?? null,
    documents,
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}

export function parsePayoutProfile(payload: unknown): PayoutProfile | null {
  const node = isRecord(unwrapData(payload))
    ? (unwrapData(payload) as Record<string, unknown>)
    : isRecord(payload)
      ? payload
      : null;
  if (!node) return null;

  const configured = Boolean(node.configured);
  const upiQrRaw = isRecord(node.upiQr)
    ? node.upiQr
    : isRecord(node.upi_qr)
      ? node.upi_qr
      : null;
  const upiQrUploaded = Boolean(upiQrRaw?.uploaded);

  return {
    configured,
    id: asString(node.id) ?? null,
    preferredMethod: inSet(
      readField(node, "preferredMethod", "preferred_method"),
      PAYOUT_METHODS
    ) as PayoutMethod | null,
    accountHolderName:
      asString(readField(node, "accountHolderName", "account_holder_name")) ?? null,
    bankName: asString(readField(node, "bankName", "bank_name")) ?? null,
    accountNumber: asString(readField(node, "accountNumber", "account_number")) ?? null,
    ifsc: asString(node.ifsc) ?? null,
    upiId: asString(readField(node, "upiId", "upi_id")) ?? null,
    upiQr: {
      uploaded: upiQrUploaded,
      filename: upiQrUploaded
        ? (asString(upiQrRaw?.filename) ?? null)
        : null,
      mimeType: upiQrUploaded
        ? (asString(readField(upiQrRaw ?? {}, "mimeType", "mime_type")) ?? null)
        : null,
      sizeBytes: upiQrUploaded
        ? (asInt(readField(upiQrRaw ?? {}, "sizeBytes", "size_bytes")) ?? null)
        : null,
    },
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")),
  };
}
