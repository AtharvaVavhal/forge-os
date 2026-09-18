import {
  asInt,
  asIsoDate,
  asString,
  isRecord,
  parseListEnvelope,
  readField,
  unwrapData,
} from "@/lib/api/parse-json";
import {
  KYC_GOVERNMENT_ID_TYPES,
  KYC_REVIEW_STATUSES,
  type FinanceKycDetail,
  type FinanceKycDocument,
  type FinanceKycListItem,
  type FinanceKycListResult,
  type KycReviewStatus,
} from "./kyc-types";

function inSet<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  return typeof value === "string" && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : null;
}

function parseDocument(value: unknown): FinanceKycDocument | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const documentType = inSet(readField(value, "documentType", "document_type"), [
    "PAN_CARD",
    "GOVERNMENT_ID",
  ] as const);
  const filename = asString(value.filename);
  const status = inSet(value.status, ["UPLOADED", "REMOVED"] as const);
  if (!id || !documentType || !filename || !status) return null;
  return {
    id,
    documentType,
    filename,
    mimeType: asString(readField(value, "mimeType", "mime_type")) ?? "",
    sizeBytes: asInt(readField(value, "sizeBytes", "size_bytes")) ?? 0,
    status,
    createdAt: asIsoDate(readField(value, "createdAt", "created_at")),
    updatedAt: asIsoDate(readField(value, "updatedAt", "updated_at")),
  };
}

export function parseFinanceKycListItem(value: unknown): FinanceKycListItem | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id);
  const status = inSet(value.status, KYC_REVIEW_STATUSES);
  const memberName = asString(readField(value, "memberName", "member_name"));
  const memberEmail = asString(readField(value, "memberEmail", "member_email"));
  if (!id || !status || !memberName || !memberEmail) return null;
  return {
    id,
    status: status as KycReviewStatus,
    memberName,
    memberEmail,
    submittedAt: asIsoDate(readField(value, "submittedAt", "submitted_at")),
    verifiedAt: asIsoDate(readField(value, "verifiedAt", "verified_at")),
    rejectedAt: asIsoDate(readField(value, "rejectedAt", "rejected_at")),
    createdAt: asIsoDate(readField(value, "createdAt", "created_at")) ?? "",
    updatedAt: asIsoDate(readField(value, "updatedAt", "updated_at")) ?? "",
  };
}

export function parseFinanceKycList(payload: unknown): FinanceKycListResult | null {
  const parsed = parseListEnvelope(payload, parseFinanceKycListItem);
  if (!parsed) return null;
  if (parsed.pagination.mode === "offset") {
    return {
      items: parsed.items,
      page: parsed.pagination.page,
      pageSize: parsed.pagination.pageSize,
      total: parsed.pagination.total ?? parsed.items.length,
    };
  }
  return {
    items: parsed.items,
    page: 1,
    pageSize: parsed.pagination.limit,
    total: parsed.items.length,
  };
}

export function parseFinanceKycDetail(payload: unknown): FinanceKycDetail | null {
  const node = isRecord(unwrapData(payload))
    ? (unwrapData(payload) as Record<string, unknown>)
    : isRecord(payload)
      ? payload
      : null;
  if (!node) return null;
  const id = asString(node.id);
  const status = asString(node.status);
  const memberRaw = node.member;
  if (!id || !status || !isRecord(memberRaw)) return null;
  const memberId = asString(memberRaw.id);
  const memberName = asString(memberRaw.name);
  const memberEmail = asString(memberRaw.email);
  if (!memberId || !memberName || !memberEmail) return null;

  const docsRaw = Array.isArray(node.documents) ? node.documents : [];
  const documents = docsRaw
    .map(parseDocument)
    .filter((d): d is FinanceKycDocument => d !== null);

  const payoutRaw = isRecord(node.payout) ? node.payout : null;

  return {
    id,
    status,
    member: { id: memberId, name: memberName, email: memberEmail },
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
    ),
    governmentIdNumber:
      asString(readField(node, "governmentIdNumber", "government_id_number")) ?? null,
    submittedAt: asIsoDate(readField(node, "submittedAt", "submitted_at")),
    verifiedAt: asIsoDate(readField(node, "verifiedAt", "verified_at")),
    rejectedAt: asIsoDate(readField(node, "rejectedAt", "rejected_at")),
    rejectionReason: asString(readField(node, "rejectionReason", "rejection_reason")) ?? null,
    documents,
    payout: {
      configured: Boolean(payoutRaw?.configured),
      preferredMethod: inSet(readField(payoutRaw ?? {}, "preferredMethod", "preferred_method"), [
        "BANK_TRANSFER",
        "UPI",
      ] as const),
      accountHolderName:
        asString(readField(payoutRaw ?? {}, "accountHolderName", "account_holder_name")) ?? null,
      bankName: asString(readField(payoutRaw ?? {}, "bankName", "bank_name")) ?? null,
      accountNumber:
        asString(readField(payoutRaw ?? {}, "accountNumber", "account_number")) ?? null,
      ifsc: asString(payoutRaw?.ifsc) ?? null,
      upiId: asString(readField(payoutRaw ?? {}, "upiId", "upi_id")) ?? null,
      upiQrUploaded: Boolean(
        payoutRaw?.upiQrUploaded ??
          payoutRaw?.upi_qr_uploaded ??
          (isRecord(payoutRaw?.upiQr) && payoutRaw.upiQr.uploaded)
      ),
    },
    createdAt: asIsoDate(readField(node, "createdAt", "created_at")) ?? "",
    updatedAt: asIsoDate(readField(node, "updatedAt", "updated_at")) ?? "",
  };
}

export function parseDownloadUrl(payload: unknown): { downloadUrl: string; expiresAt: string } | null {
  const node = isRecord(unwrapData(payload))
    ? (unwrapData(payload) as Record<string, unknown>)
    : isRecord(payload)
      ? payload
      : null;
  if (!node) return null;
  const downloadUrl = asString(readField(node, "downloadUrl", "download_url"));
  const expiresAt = asString(readField(node, "expiresAt", "expires_at"));
  if (!downloadUrl || !expiresAt) return null;
  return { downloadUrl, expiresAt };
}
