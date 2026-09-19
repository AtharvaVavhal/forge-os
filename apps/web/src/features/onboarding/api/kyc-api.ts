import { ApiClientError } from "@forge/api-client";
import { apiClient } from "@/lib/api/client";
import { browserMutate } from "@/lib/api/browser-mutate";
import { parsePresign } from "@/features/shared/api/parse";
import { onboardingKycPaths } from "./paths";
import { parseKycDocument, parseKycProfile, parsePayoutProfile, parseWorkProfile } from "./parse";
import type {
  KycDocument,
  KycDocumentType,
  KycProfile,
  KycWritableFields,
  PayoutProfile,
  UpsertPayoutBody,
  UpsertWorkProfileBody,
  WorkProfile,
} from "./types";
import {
  MAX_KYC_DOCUMENT_BYTES,
  KYC_ALLOWED_MIME_TYPES,
  MAX_UPI_QR_BYTES,
  UPI_QR_ALLOWED_MIME_TYPES,
} from "./types";

function requireParsed<T>(value: T | null, label: string): T {
  if (value === null) {
    throw new Error(`Unexpected ${label} payload from the API.`);
  }
  return value;
}

export async function getOwnKycProfile(): Promise<KycProfile | null> {
  try {
    const payload = await apiClient.get<unknown>(onboardingKycPaths.kyc);
    return requireParsed(parseKycProfile(payload), "KYC profile");
  } catch (error) {
    if (error instanceof ApiClientError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function createKycProfile(body: KycWritableFields): Promise<KycProfile> {
  const payload = await browserMutate<unknown>("POST", onboardingKycPaths.kyc, { body });
  return requireParsed(parseKycProfile(payload), "KYC profile");
}

export async function updateKycProfile(body: KycWritableFields): Promise<KycProfile> {
  const payload = await browserMutate<unknown>("PATCH", onboardingKycPaths.kyc, { body });
  return requireParsed(parseKycProfile(payload), "KYC profile");
}

/** Create if absent, otherwise patch — uses GET to decide. */
export async function saveKycProfile(body: KycWritableFields): Promise<KycProfile> {
  const existing = await getOwnKycProfile();
  if (!existing) {
    return createKycProfile(body);
  }
  return updateKycProfile(body);
}

export async function submitKycProfile(): Promise<KycProfile> {
  const payload = await browserMutate<unknown>("POST", onboardingKycPaths.submit, {
    body: {},
  });
  return requireParsed(parseKycProfile(payload), "KYC profile");
}

export async function getOwnWorkProfile(): Promise<WorkProfile> {
  const payload = await apiClient.get<unknown>(onboardingKycPaths.workProfile);
  return requireParsed(parseWorkProfile(payload), "work profile");
}

/** Writes to `User` directly — the API re-issues `forge_session`/CSRF in the response, which `browserMutate`'s caller doesn't need to handle: the browser applies the new Set-Cookie automatically. */
export async function upsertWorkProfile(body: UpsertWorkProfileBody): Promise<WorkProfile> {
  const payload = await browserMutate<unknown>("PUT", onboardingKycPaths.workProfile, { body });
  return requireParsed(parseWorkProfile(payload), "work profile");
}

export async function getOwnPayoutProfile(): Promise<PayoutProfile> {
  const payload = await apiClient.get<unknown>(onboardingKycPaths.payoutProfile);
  return requireParsed(parsePayoutProfile(payload), "payout profile");
}

export async function upsertPayoutProfile(body: UpsertPayoutBody): Promise<PayoutProfile> {
  const payload = await browserMutate<unknown>("PUT", onboardingKycPaths.payoutProfile, {
    body,
  });
  return requireParsed(parsePayoutProfile(payload), "payout profile");
}

export async function uploadKycDocument(
  file: File,
  documentType: KycDocumentType
): Promise<KycDocument> {
  if (file.size > MAX_KYC_DOCUMENT_BYTES) {
    throw new Error("Files larger than 25MB are not accepted.");
  }
  const mimeType = file.type || "application/octet-stream";
  if (!(KYC_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("Use PDF, JPEG, PNG, or WebP.");
  }

  const presignPayload = await browserMutate<unknown>(
    "POST",
    onboardingKycPaths.documentsPresign,
    {
      body: {
        documentType,
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
      },
    }
  );
  const presign = parsePresign(presignPayload);
  if (!presign?.storageKey) {
    throw new Error("The API did not return an upload URL.");
  }

  let uploaded: Response;
  try {
    uploaded = await fetch(presign.url, {
      method: presign.method,
      body: file,
      headers: { "Content-Type": mimeType },
    });
  } catch (cause) {
    throw new Error("Upload failed. Try again.", { cause });
  }
  if (!uploaded.ok) {
    throw new Error("Upload failed. Try again.");
  }

  const registered = await browserMutate<unknown>("POST", onboardingKycPaths.documents, {
    body: {
      documentType,
      filename: file.name,
      storageKey: presign.storageKey,
      mimeType,
      sizeBytes: file.size,
    },
  });
  return requireParsed(parseKycDocument(registered), "KYC document");
}

export async function removeKycDocument(id: string): Promise<void> {
  await browserMutate<unknown>("POST", onboardingKycPaths.documentDelete(id), {
    body: {},
  });
}

export async function uploadUpiQr(file: File): Promise<PayoutProfile> {
  if (file.size > MAX_UPI_QR_BYTES) {
    throw new Error("Files larger than 25MB are not accepted.");
  }
  const mimeType = file.type || "application/octet-stream";
  if (!(UPI_QR_ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new Error("Use PNG, JPG, or WebP.");
  }

  const presignPayload = await browserMutate<unknown>(
    "POST",
    onboardingKycPaths.upiQrPresign,
    {
      body: {
        filename: file.name,
        mimeType,
        sizeBytes: file.size,
      },
    }
  );
  const presign = parsePresign(presignPayload);
  if (!presign?.storageKey) {
    throw new Error("The API did not return an upload URL.");
  }

  let uploaded: Response;
  try {
    uploaded = await fetch(presign.url, {
      method: presign.method,
      body: file,
      headers: { "Content-Type": mimeType },
    });
  } catch (cause) {
    throw new Error("Upload failed. Try again.", { cause });
  }
  if (!uploaded.ok) {
    throw new Error("Upload failed. Try again.");
  }

  const registered = await browserMutate<unknown>("POST", onboardingKycPaths.upiQrRegister, {
    body: {
      filename: file.name,
      storageKey: presign.storageKey,
      mimeType,
      sizeBytes: file.size,
    },
  });
  return requireParsed(parsePayoutProfile(registered), "payout profile");
}

export async function removeUpiQr(): Promise<PayoutProfile> {
  const payload = await browserMutate<unknown>("POST", onboardingKycPaths.upiQrDelete, {
    body: {},
  });
  return requireParsed(parsePayoutProfile(payload), "payout profile");
}
