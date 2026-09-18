import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
  PRESIGNED_URL_TTL_SECONDS,
  StorageService,
} from "./storage.service";
import type { AppConfig } from "../../../../config/configuration";

function configWithR2(overrides?: Partial<AppConfig["storage"]["r2"]>): ConfigService<AppConfig, true> {
  const r2 = {
    accountId: "test-account",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret-access-key-value",
    bucketName: "test-bucket",
    configured: true,
    ...overrides,
  };
  return {
    get: (key: string) => {
      if (key === "storage.r2") return r2;
      if (key === "storage.signingSecret") return undefined;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

describe("StorageService (R2)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("reports configured when R2 credentials are present", () => {
    const storage = new StorageService(configWithR2());
    expect(storage.isConfigured()).toBe(true);
  });

  it("throws STORAGE_NOT_CONFIGURED when R2 is missing", async () => {
    const storage = new StorageService(
      configWithR2({
        accountId: "",
        accessKeyId: "",
        secretAccessKey: "",
        bucketName: "",
        configured: false,
      })
    );
    expect(storage.isConfigured()).toBe(false);
    await expect(
      storage.generateUploadUrl("org-1", "a.pdf", "application/pdf", 100)
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it("generates an org-scoped storage key and R2 presigned upload URL", async () => {
    const storage = new StorageService(configWithR2());
    const result = await storage.generateUploadUrl(
      "org-aaaa-bbbb-cccc-ddddeeee",
      "My Report.pdf",
      "application/pdf",
      2048
    );

    expect(result.storageKey.startsWith("org-aaaa-bbbb-cccc-ddddeeee/")).toBe(true);
    expect(result.storageKey).toContain("My_Report.pdf");
    expect(result.uploadUrl).toContain("X-Amz-Signature=");
    expect(result.uploadUrl).not.toMatch(/test-secret-access-key/i);
    expect(result.maxSizeBytes).toBe(MAX_FILE_SIZE_BYTES);
    expect(Date.parse(result.expiresAt)).toBeGreaterThan(Date.now());
    expect(getSignedUrl).toHaveBeenCalled();
  });

  it("generates a download URL with attachment disposition and no secrets", async () => {
    const storage = new StorageService(configWithR2());
    const result = await storage.generateDownloadUrl(
      "org-1/uuid-file.pdf",
      'quote"name.pdf',
      "application/pdf"
    );

    expect(result.downloadUrl).toContain("response-content-disposition=");
    expect(result.downloadUrl).toMatch(/attachment/i);
    expect(result.downloadUrl).toContain("X-Amz-Signature=");
    expect(result.downloadUrl).not.toMatch(/SECRET_ACCESS|secret-access-key/i);
  });

  it("rejects path traversal and cross-org storage keys", () => {
    const storage = new StorageService(configWithR2());
    expect(() => storage.assertValidStorageKeyForOrg("../etc/passwd", "org-1")).toThrow(
      BadRequestException
    );
    expect(() =>
      storage.assertValidStorageKeyForOrg("org-other/uuid-file.pdf", "org-1")
    ).toThrow(BadRequestException);
    expect(() =>
      storage.assertValidStorageKeyForOrg("org-1/nested/path.pdf", "org-1")
    ).toThrow(BadRequestException);
    expect(() =>
      storage.assertValidStorageKeyForOrg("org-1/uuid-file.pdf", "org-1")
    ).not.toThrow();
  });

  it("enforces MIME allowlist and 25MB limit", () => {
    const storage = new StorageService(configWithR2());
    expect(() => storage.assertValidFile("application/x-msdownload", 100)).toThrow(
      BadRequestException
    );
    expect(() => storage.assertValidFile("application/pdf", MAX_FILE_SIZE_BYTES + 1)).toThrow(
      BadRequestException
    );
    expect(() => storage.assertValidFile("application/pdf", 100)).not.toThrow();
    expect(ALLOWED_MIME_TYPES.has("image/svg+xml")).toBe(true);
  });

  it("sanitizes filenames", () => {
    const storage = new StorageService(configWithR2());
    expect(storage.sanitizeFilename("../../weird name!.pdf")).toBe(".._.._weird_name_.pdf");
  });

  it("verifies R2 object exists after upload (HeadObject)", async () => {
    const storage = new StorageService(configWithR2());
    const upload = await storage.generateUploadUrl("org-1", "a.pdf", "application/pdf", 512);
    await expect(
      storage.assertObjectMatchesRegistration(upload.storageKey, "application/pdf", 512)
    ).resolves.toBeUndefined();
  });

  it("rejects registration when object is missing in R2", async () => {
    const storage = new StorageService(configWithR2());
    await expect(
      storage.assertObjectMatchesRegistration("org-1/never-uploaded.pdf", "application/pdf", 100)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects registration when size mismatches", async () => {
    const storage = new StorageService(configWithR2());
    const upload = await storage.generateUploadUrl("org-1", "a.pdf", "application/pdf", 512);
    await expect(
      storage.assertObjectMatchesRegistration(upload.storageKey, "application/pdf", 999)
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("uses a 15-minute signed URL TTL", () => {
    expect(PRESIGNED_URL_TTL_SECONDS).toBe(900);
  });

  it("maps R2 SDK failures to safe STORAGE_UNAVAILABLE errors", async () => {
    jest.mocked(getSignedUrl).mockRejectedValueOnce(new Error("CredentialProviderError"));
    const storage = new StorageService(configWithR2());
    await expect(
      storage.generateUploadUrl("org-1", "a.pdf", "application/pdf", 100)
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
