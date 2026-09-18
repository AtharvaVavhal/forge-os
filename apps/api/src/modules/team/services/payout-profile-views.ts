import type { PayoutMethod, PayoutProfile } from "@prisma/client";

/** Member-facing UPI QR summary — never includes storage_key or URLs. */
export interface UpiQrView {
  uploaded: boolean;
  filename: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

/** Member-facing payout profile — never includes QR storage keys. */
export interface PayoutProfileView {
  configured: boolean;
  id: string | null;
  preferredMethod: PayoutMethod | null;
  accountHolderName: string | null;
  bankName: string | null;
  accountNumber: string | null;
  ifsc: string | null;
  upiId: string | null;
  upiQr: UpiQrView;
  createdAt: string | null;
  updatedAt: string | null;
}

export function emptyUpiQrView(): UpiQrView {
  return {
    uploaded: false,
    filename: null,
    mimeType: null,
    sizeBytes: null,
  };
}

export function emptyPayoutProfileView(): PayoutProfileView {
  return {
    configured: false,
    id: null,
    preferredMethod: null,
    accountHolderName: null,
    bankName: null,
    accountNumber: null,
    ifsc: null,
    upiId: null,
    upiQr: emptyUpiQrView(),
    createdAt: null,
    updatedAt: null,
  };
}

export function toUpiQrView(profile: PayoutProfile): UpiQrView {
  const uploaded = Boolean(profile.upi_qr_storage_key);
  return {
    uploaded,
    filename: uploaded ? profile.upi_qr_filename : null,
    mimeType: uploaded ? profile.upi_qr_mime_type : null,
    sizeBytes: uploaded ? profile.upi_qr_size_bytes : null,
  };
}

export function toPayoutProfileView(profile: PayoutProfile): PayoutProfileView {
  return {
    configured: true,
    id: profile.id,
    preferredMethod: profile.preferred_method,
    accountHolderName: profile.account_holder_name,
    bankName: profile.bank_name,
    accountNumber: profile.account_number,
    ifsc: profile.ifsc,
    upiId: profile.upi_id,
    upiQr: toUpiQrView(profile),
    createdAt: profile.created_at.toISOString(),
    updatedAt: profile.updated_at.toISOString(),
  };
}

/** Audit-safe snapshot — never includes account/IFSC/UPI values or storage keys. */
export function toPayoutProfileAuditSnapshot(
  profile: Pick<PayoutProfile, "id" | "preferred_method" | "upi_qr_storage_key">
): Record<string, unknown> {
  return {
    profileId: profile.id,
    preferredMethod: profile.preferred_method,
    hasUpiQr: Boolean(profile.upi_qr_storage_key),
  };
}
