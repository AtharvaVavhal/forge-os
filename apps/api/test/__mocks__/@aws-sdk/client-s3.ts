import { mockR2Objects } from "../r2-object-store";

export class PutObjectCommand {
  input: Record<string, unknown>;
  constructor(input: Record<string, unknown>) {
    this.input = input;
  }
}

export class GetObjectCommand {
  input: Record<string, unknown>;
  constructor(input: Record<string, unknown>) {
    this.input = input;
  }
}

export class HeadObjectCommand {
  input: Record<string, unknown>;
  constructor(input: Record<string, unknown>) {
    this.input = input;
  }
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

export class S3Client {
  constructor(_config?: unknown) {
    void _config;
  }

  send(command: { constructor?: { name?: string }; input?: Record<string, unknown> }) {
    const name = command?.constructor?.name ?? "";
    const input = command?.input ?? {};
    const key = asString(input.Key, "");

    if (name === "HeadObjectCommand") {
      const obj = mockR2Objects.get(key);
      if (!obj) {
        const err = new Error("NotFound") as Error & {
          name: string;
          $metadata: { httpStatusCode: number };
        };
        err.name = "NotFound";
        err.$metadata = { httpStatusCode: 404 };
        throw err;
      }
      return Promise.resolve({
        ContentLength: obj.sizeBytes,
        ContentType: obj.mimeType,
      });
    }

    return Promise.resolve({});
  }
}
