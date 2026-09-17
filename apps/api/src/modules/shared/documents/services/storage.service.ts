import { BadRequestException, Injectable } from "@nestjs/common";
import * as crypto from "crypto";

export const MAX_FILE_SIZE_BYTES = 26_214_400; // 25 MB

export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/svg+xml",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/zip",
]);

export interface PresignedUploadResult {
  storageKey: string;
  uploadUrl: string;
  expiresAt: string;
  maxSizeBytes: number;
}

export interface PresignedDownloadResult {
  downloadUrl: string;
  expiresAt: string;
}

@Injectable()
export class StorageService {
  private readonly signingSecret: string;

  constructor() {
    this.signingSecret =
      process.env.STORAGE_SIGNING_SECRET ||
      process.env.JWT_SECRET ||
      "forge-storage-signing-secret-default-change-in-prod";
  }

  assertValidFile(mimeType: string, sizeBytes: number): void {
    if (!sizeBytes || sizeBytes <= 0 || sizeBytes > MAX_FILE_SIZE_BYTES) {
      throw new BadRequestException({
        code: "INVALID_FILE_SIZE",
        message: `File size must be between 1 byte and ${MAX_FILE_SIZE_BYTES} bytes (25MB).`,
      });
    }

    const normalizedMime = mimeType.toLowerCase().trim();
    if (!ALLOWED_MIME_TYPES.has(normalizedMime)) {
      throw new BadRequestException({
        code: "UNSUPPORTED_MIME_TYPE",
        message: `MIME type "${mimeType}" is not allowed. Uploads must be documents, spreadsheets, images, or archives.`,
      });
    }
  }

  generateUploadUrl(
    organizationId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number
  ): PresignedUploadResult {
    this.assertValidFile(mimeType, sizeBytes);

    const sanitizedFilename = filename
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 100);
    const storageKey = `${organizationId}/${crypto.randomUUID()}-${sanitizedFilename}`;

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const signature = this.computeSignature(
      `UPLOAD:${storageKey}:${mimeType}:${sizeBytes}:${expiresAt}`
    );

    const baseUrl = process.env.STORAGE_BASE_URL || "https://storage.forge.internal";
    const uploadUrl = `${baseUrl}/upload/${encodeURIComponent(storageKey)}?expires=${encodeURIComponent(
      expiresAt
    )}&sig=${signature}`;

    return {
      storageKey,
      uploadUrl,
      expiresAt,
      maxSizeBytes: MAX_FILE_SIZE_BYTES,
    };
  }

  generateDownloadUrl(
    storageKey: string,
    filename: string,
    mimeType: string
  ): PresignedDownloadResult {
    const sanitizedFilename = filename.replace(/["\r\n]/g, "_");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const signature = this.computeSignature(
      `DOWNLOAD:${storageKey}:${sanitizedFilename}:${expiresAt}`
    );

    const baseUrl = process.env.STORAGE_BASE_URL || "https://storage.forge.internal";
    const downloadUrl = `${baseUrl}/download/${encodeURIComponent(
      storageKey
    )}?filename=${encodeURIComponent(
      sanitizedFilename
    )}&mime=${encodeURIComponent(mimeType)}&disposition=attachment&expires=${encodeURIComponent(
      expiresAt
    )}&sig=${signature}`;

    return {
      downloadUrl,
      expiresAt,
    };
  }

  private computeSignature(payload: string): string {
    return crypto
      .createHmac("sha256", this.signingSecret)
      .update(payload)
      .digest("hex");
  }
}
