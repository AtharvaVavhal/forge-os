/**
 * Contract test against the REAL @aws-sdk/client-s3 / s3-request-presigner —
 * run via `jest --config ./test/jest-contract.json`, deliberately outside the
 * main jest config so the aws-sdk moduleNameMapper mocks (used everywhere
 * else) don't hide the SDK's actual signing behavior.
 *
 * Regression: AWS SDK v3 >= 3.729 defaults to auto-signing an
 * x-amz-checksum-crc32 for PutObject, computed over whatever body is on the
 * command at presign time. StorageService never attaches a Body (the browser
 * uploads directly to R2), so that checksum is computed over an empty
 * payload and baked into the URL's signed query string. R2 then rejects the
 * real (non-empty) upload's checksum mismatch with a 403 that the browser
 * reports as a CORS failure, because the frontend's plain `fetch(url, {
 * method: "PUT", body: file, headers: { "Content-Type": mimeType } })` never
 * sends (and cannot reproduce) that checksum.
 */
import { ConfigService } from "@nestjs/config";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { StorageService } from "../src/modules/shared/documents/services/storage.service";
import type { AppConfig } from "../src/config/configuration";

function configWithR2(): ConfigService<AppConfig, true> {
  const r2 = {
    accountId: "test-account",
    accessKeyId: "test-access-key-id",
    secretAccessKey: "test-secret-access-key-value",
    bucketName: "test-bucket",
    configured: true,
  };
  return {
    get: (key: string) => {
      if (key === "storage.r2") return r2;
      if (key === "storage.signingSecret") return undefined;
      return undefined;
    },
  } as unknown as ConfigService<AppConfig, true>;
}

/**
 * Headers a browser's plain `fetch(url, { method: "PUT", body: file, headers: {...} })`
 * can reliably reproduce. `content-length` is deliberately excluded: the Fetch
 * spec forbids page code from setting it explicitly, and in practice R2 403s
 * the request when it's part of X-Amz-SignedHeaders — see
 * test/r2-presign-content-length.contract-spec.ts.
 */
const BROWSER_SUPPLIED_HEADERS = new Set(["host"]);

describe("R2 presigned upload — checksum signing contract (real AWS SDK)", () => {
  it("signs the browser PUT URL without requiring a checksum header the frontend never sends", async () => {
    const storage = new StorageService(configWithR2());
    const upload = await storage.generateUploadUrl(
      "org-1",
      "passport.pdf",
      "application/pdf",
      2048
    );

    const url = new URL(upload.uploadUrl);
    const signedHeaders = url.searchParams.get("X-Amz-SignedHeaders");

    expect(signedHeaders).toBe("host");
    for (const header of (signedHeaders ?? "").split(";")) {
      expect(BROWSER_SUPPLIED_HEADERS.has(header)).toBe(true);
    }

    // No checksum requirement anywhere in the presigned URL — neither as a
    // signed header nor smuggled in as an extra signed query parameter.
    for (const key of url.searchParams.keys()) {
      expect(key.toLowerCase()).not.toMatch(/^x-amz-checksum-/);
      expect(key.toLowerCase()).not.toBe("x-amz-sdk-checksum-algorithm");
    }
  });

  it("documents the regression: the SDK default DOES sign a bogus empty-body checksum", async () => {
    // Same client/command shape as StorageService, minus the fix — proves
    // this is what breaks without requestChecksumCalculation: "WHEN_REQUIRED".
    const unfixedClient = new S3Client({
      region: "auto",
      endpoint: "https://test-account.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "test-access-key-id",
        secretAccessKey: "test-secret-access-key-value",
      },
    });

    const command = new PutObjectCommand({
      Bucket: "test-bucket",
      Key: "org-1/passport.pdf",
      ContentType: "application/pdf",
      ContentLength: 2048,
    });
    const uploadUrl = await getSignedUrl(unfixedClient, command, { expiresIn: 900 });
    const url = new URL(uploadUrl);

    // CRC32 of an empty payload — never the real file's checksum.
    expect(url.searchParams.get("x-amz-checksum-crc32")).toBe("AAAAAA==");
    expect(url.searchParams.get("x-amz-sdk-checksum-algorithm")).toBe("CRC32");
  });
});
