import { describe, expect, it } from "vitest";
import { isSafeDownloadUrl } from "./safe-url";

describe("isSafeDownloadUrl", () => {
  it("allows https URLs", () => {
    expect(isSafeDownloadUrl("https://cdn.example.com/signed?sig=abc")).toBe(true);
  });

  it("rejects javascript and data schemes", () => {
    expect(isSafeDownloadUrl("javascript:alert(1)")).toBe(false);
    expect(isSafeDownloadUrl("data:text/html,hi")).toBe(false);
  });

  it("rejects protocol-relative URLs", () => {
    expect(isSafeDownloadUrl("//evil.example/path")).toBe(false);
  });

  it("rejects http URLs that are not localhost", () => {
    expect(isSafeDownloadUrl("http://evil.example/file")).toBe(false);
  });
});
