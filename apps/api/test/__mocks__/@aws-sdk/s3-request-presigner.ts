import { mockR2Objects } from "../r2-object-store";

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export const getSignedUrl = jest.fn(
  (_client: unknown, command: { constructor?: { name?: string }; input?: Record<string, unknown> }) => {
    const name = command?.constructor?.name ?? "";
    const input = command?.input ?? {};
    const key = asString(input.Key, "unknown");
    const bucket = asString(input.Bucket, "test-bucket");

    if (name === "PutObjectCommand") {
      mockR2Objects.set(key, {
        sizeBytes: Number(input.ContentLength ?? 0),
        mimeType: asString(input.ContentType, "application/octet-stream"),
      });
      return Promise.resolve(
        `https://${bucket}.test-account.r2.cloudflarestorage.com/${encodeURIComponent(
          key
        )}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test-upload`
      );
    }

    if (name === "GetObjectCommand") {
      const disposition = asString(input.ResponseContentDisposition, "attachment");
      return Promise.resolve(
        `https://${bucket}.test-account.r2.cloudflarestorage.com/${encodeURIComponent(
          key
        )}?response-content-disposition=${encodeURIComponent(
          disposition
        )}&X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Signature=test-download`
      );
    }

    return Promise.resolve(`https://${bucket}.test-account.r2.cloudflarestorage.com/unknown`);
  }
);
