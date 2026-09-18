/**
 * Contract test against the REAL @aws-sdk/client-s3 / s3-request-presigner —
 * run via `jest --config ./test/jest-contract.json`, deliberately outside the
 * main jest config so the aws-sdk moduleNameMapper mocks (used everywhere
 * else) don't hide the SDK's actual signing behavior.
 *
 * Regression: StorageService sets ContentLength on the PutObjectCommand it
 * presigns (to document the declared upload size). Because that field
 * serializes to a `content-length` header on the request the presigner
 * signs, the AWS SDK v3 default behavior folds it into the URL's
 * X-Amz-SignedHeaders — requiring the eventual PUT to carry a `content-length`
 * header whose value exactly matches, or R2 rejects the signature.
 *
 * A browser's `fetch`/XHR can never explicitly set that header — it's a
 * forbidden header name per the Fetch spec (https://fetch.spec.whatwg.org/#forbidden-request-header):
 * the user agent derives it from the request body and refuses to let page
 * code override it. Even though the browser's own value happens to match the
 * declared size, R2 still 403s the presigned PUT once `content-length` is
 * part of SignedHeaders, which the browser reports as an opaque CORS failure
 * (no Access-Control-Allow-Origin on the error response) — the same failure
 * shape as the checksum-signing regression in
 * test/r2-presign-checksum.contract-spec.ts. The frontend's
 * `fetch(url, { method: "PUT", body: file, headers: { "Content-Type": mimeType } })`
 * (apps/web/src/features/onboarding/api/kyc-api.ts,
 * apps/web/src/features/shared/api/shared-api.ts) never sets Content-Length
 * itself, by design/spec necessity.
 *
 * Fix: getSignedUrl() is called with `unsignableHeaders: new Set(["content-length"])`,
 * which excludes it from the signature entirely (verified below to produce a
 * SignedHeaders list of just `host`). The declared size is still enforced
 * server-side — assertValidFile() rejects out-of-range sizes before a URL is
 * ever issued, and assertObjectMatchesRegistration()'s HeadObject check
 * rejects registration if the object R2 actually stored doesn't match.
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
 * Signed headers a browser's plain `fetch(url, { method: "PUT", body: file,
 * headers: { "Content-Type": mimeType } })` can reliably satisfy. `host` is
 * set by the UA for every request; `content-type` is explicitly set by the
 * frontend. `content-length` is excluded — see file header comment.
 */
const BROWSER_RELIABLE_SIGNED_HEADERS = new Set(["host", "content-type"]);

describe("R2 presigned upload — Content-Length signing contract (real AWS SDK)", () => {
  it("signs the browser PUT URL without requiring a content-length header the frontend cannot set", async () => {
    const storage = new StorageService(configWithR2());
    const upload = await storage.generateUploadUrl(
      "org-1",
      "passport.pdf",
      "application/pdf",
      2048
    );

    const url = new URL(upload.uploadUrl);
    const signedHeaders = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");

    expect(signedHeaders).toEqual(["host"]);
    expect(signedHeaders).not.toContain("content-length");
    for (const header of signedHeaders) {
      expect(BROWSER_RELIABLE_SIGNED_HEADERS.has(header)).toBe(true);
    }
  });

  it("documents the regression: signing ContentLength by default breaks browser PUTs", async () => {
    // Same client/command shape as StorageService, minus the fix — proves
    // this is what breaks without unsignableHeaders: ["content-length"].
    const unfixedClient = new S3Client({
      region: "auto",
      endpoint: "https://test-account.r2.cloudflarestorage.com",
      credentials: {
        accessKeyId: "test-access-key-id",
        secretAccessKey: "test-secret-access-key-value",
      },
      requestChecksumCalculation: "WHEN_REQUIRED",
    });

    const command = new PutObjectCommand({
      Bucket: "test-bucket",
      Key: "org-1/passport.pdf",
      ContentType: "application/pdf",
      ContentLength: 2048,
    });
    const uploadUrl = await getSignedUrl(unfixedClient, command, { expiresIn: 900 });
    const url = new URL(uploadUrl);

    expect(url.searchParams.get("X-Amz-SignedHeaders")).toBe("content-length;host");
  });
});
