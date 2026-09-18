import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import * as crypto from "crypto";
import type { AppConfig } from "../../../../config/configuration";

export const MAX_FILE_SIZE_BYTES = 26_214_400; // 25 MB

/** Presigned URL lifetime — short-lived; authorization remains Forge-side. */
export const PRESIGNED_URL_TTL_SECONDS = 15 * 60;

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
  private readonly logger = new Logger(StorageService.name);
  private readonly client: S3Client | null;
  private readonly bucket: string | null;
  private readonly configured: boolean;

  constructor(private readonly config: ConfigService<AppConfig, true>) {
    const r2 = this.config.get("storage.r2", { infer: true });
    this.configured = Boolean(r2?.configured);
    this.bucket = r2?.bucketName ?? null;

    if (this.configured && r2) {
      // Cloudflare R2 S3-compatible endpoint — derived from account id, never hardcoded per-tenant.
      this.client = new S3Client({
        region: "auto",
        endpoint: `https://${r2.accountId}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: r2.accessKeyId,
          secretAccessKey: r2.secretAccessKey,
        },
        // AWS SDK v3 (>=3.729) defaults to "WHEN_SUPPORTED": it auto-adds a
        // CRC32 checksum for PutObject, computed against whatever body is on
        // the command at presign time. We never attach a Body (the file is
        // uploaded browser -> R2, not through this server), so that checksum
        // is computed over an empty payload and gets signed into the URL's
        // query string. R2 then validates the real upload's checksum against
        // that bogus value and rejects it — surfacing to the browser as an
        // opaque CORS-blocked 403. "WHEN_REQUIRED" restores pre-3.729
        // behavior: only compute a checksum when the operation mandates one
        // or the caller explicitly sets ChecksumAlgorithm (we do neither).
        requestChecksumCalculation: "WHEN_REQUIRED",
      });
    } else {
      this.client = null;
    }
  }

  isConfigured(): boolean {
    return this.configured;
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

  /**
   * B9: storage keys must be org-prefixed and free of traversal sequences.
   * Create/register must reject foreign or rebinding-friendly keys.
   */
  assertValidStorageKeyForOrg(storageKey: string, organizationId: string): void {
    const prefix = `${organizationId}/`;
    if (!storageKey.startsWith(prefix)) {
      throw new BadRequestException({
        code: "INVALID_STORAGE_KEY",
        message: "storageKey must be issued for the caller's organization.",
      });
    }
    const remainder = storageKey.slice(prefix.length);
    if (
      !remainder ||
      remainder.includes("..") ||
      remainder.includes("/") ||
      remainder.includes("\\") ||
      remainder.includes("\0")
    ) {
      throw new BadRequestException({
        code: "INVALID_STORAGE_KEY",
        message: "storageKey format is invalid.",
      });
    }
  }

  sanitizeFilename(filename: string): string {
    return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
  }

  async generateUploadUrl(
    organizationId: string,
    filename: string,
    mimeType: string,
    sizeBytes: number
  ): Promise<PresignedUploadResult> {
    this.assertValidFile(mimeType, sizeBytes);
    const { client, bucket } = this.requireClient();

    const sanitizedFilename = this.sanitizeFilename(filename);
    const storageKey = `${organizationId}/${crypto.randomUUID()}-${sanitizedFilename}`;
    const expiresAt = new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000).toISOString();

    try {
      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ContentType: mimeType.toLowerCase().trim(),
        ContentLength: sizeBytes,
      });
      const uploadUrl = await getSignedUrl(client, command, {
        expiresIn: PRESIGNED_URL_TTL_SECONDS,
        // ContentLength above puts a `content-length` header on the request
        // the presigner signs, so by default it lands in the URL's
        // X-Amz-SignedHeaders — requiring the eventual PUT to carry a
        // `content-length` header with an exactly matching value. A
        // browser's `fetch`/XHR can never supply that explicitly (it's a
        // forbidden header name per the Fetch spec: the UA sets it from the
        // body's byte length, outside the page's control), and in practice
        // R2 rejects the resulting request with a 403 the browser reports as
        // a CORS failure (no Access-Control-Allow-Origin), the same failure
        // shape as the checksum-signing bug this mirrors. Exclude it from
        // the signature so SignedHeaders is just `host` — the declared size
        // is still enforced via assertValidFile() before signing and via
        // HeadObject in assertObjectMatchesRegistration() after upload.
        unsignableHeaders: new Set(["content-length"]),
      });

      return {
        storageKey,
        uploadUrl,
        expiresAt,
        maxSizeBytes: MAX_FILE_SIZE_BYTES,
      };
    } catch (error) {
      this.logger.error(
        `Failed to create R2 upload URL (${error instanceof Error ? error.name : "unknown"})`
      );
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is temporarily unavailable.",
      });
    }
  }

  async generateDownloadUrl(
    storageKey: string,
    filename: string,
    mimeType: string
  ): Promise<PresignedDownloadResult> {
    const { client, bucket } = this.requireClient();
    const sanitizedFilename = filename.replace(/["\r\n]/g, "_");
    const expiresAt = new Date(Date.now() + PRESIGNED_URL_TTL_SECONDS * 1000).toISOString();

    // Force attachment disposition — SVG (and other types) must not execute inline.
    const contentDisposition = `attachment; filename="${sanitizedFilename}"`;

    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: storageKey,
        ResponseContentDisposition: contentDisposition,
        ResponseContentType: mimeType.toLowerCase().trim(),
      });
      const downloadUrl = await getSignedUrl(client, command, {
        expiresIn: PRESIGNED_URL_TTL_SECONDS,
      });

      return { downloadUrl, expiresAt };
    } catch (error) {
      this.logger.error(
        `Failed to create R2 download URL (${error instanceof Error ? error.name : "unknown"})`
      );
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is temporarily unavailable.",
      });
    }
  }

  /**
   * Verify the object exists in R2 and matches the declared size/MIME before
   * registering a Document row (prevents registering phantom keys).
   */
  async assertObjectMatchesRegistration(
    storageKey: string,
    mimeType: string,
    sizeBytes: number
  ): Promise<void> {
    const { client, bucket } = this.requireClient();

    try {
      const head = await client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: storageKey,
        })
      );

      if (typeof head.ContentLength === "number" && head.ContentLength !== sizeBytes) {
        throw new BadRequestException({
          code: "STORAGE_OBJECT_MISMATCH",
          message: "Uploaded object size does not match the registered document.",
        });
      }

      const declaredMime = mimeType.toLowerCase().trim();
      if (head.ContentType) {
        const storedMime = head.ContentType.toLowerCase().split(";")[0]?.trim();
        if (storedMime && storedMime !== declaredMime) {
          throw new BadRequestException({
            code: "STORAGE_OBJECT_MISMATCH",
            message: "Uploaded object MIME type does not match the registered document.",
          });
        }
      }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;

      const status =
        typeof error === "object" &&
        error !== null &&
        "$metadata" in error &&
        typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata
          ?.httpStatusCode === "number"
          ? (error as { $metadata: { httpStatusCode: number } }).$metadata.httpStatusCode
          : undefined;

      if (status === 404 || (error instanceof Error && error.name === "NotFound")) {
        throw new BadRequestException({
          code: "STORAGE_OBJECT_MISSING",
          message: "Upload was not found in storage. Complete the upload before registering.",
        });
      }

      this.logger.error(
        `R2 HeadObject failed (${error instanceof Error ? error.name : "unknown"})`
      );
      throw new ServiceUnavailableException({
        code: "STORAGE_UNAVAILABLE",
        message: "Document storage is temporarily unavailable.",
      });
    }
  }

  private requireClient(): { client: S3Client; bucket: string } {
    if (!this.configured || !this.client || !this.bucket) {
      throw new ServiceUnavailableException({
        code: "STORAGE_NOT_CONFIGURED",
        message: "Document storage is not configured in this environment.",
      });
    }
    return { client: this.client, bucket: this.bucket };
  }
}
