import { CsrfService } from "./csrf.service";

function makeCsrfService(): CsrfService {
  const fakeConfig = { get: () => undefined } as never;
  return new CsrfService(fakeConfig);
}

describe("CsrfService", () => {
  it("matches identical cookie and header values", () => {
    const service = makeCsrfService();
    expect(service.matches("same-value-123", "same-value-123")).toBe(true);
  });

  it("rejects a mismatched header", () => {
    const service = makeCsrfService();
    expect(service.matches("cookie-value", "different-header-value")).toBe(false);
  });

  it("rejects when the cookie is missing", () => {
    const service = makeCsrfService();
    expect(service.matches(undefined, "some-header-value")).toBe(false);
  });

  it("rejects when the header is missing", () => {
    const service = makeCsrfService();
    expect(service.matches("some-cookie-value", undefined)).toBe(false);
  });

  it("rejects when both are missing", () => {
    const service = makeCsrfService();
    expect(service.matches(undefined, undefined)).toBe(false);
  });

  it("rejects values of different lengths without throwing", () => {
    const service = makeCsrfService();
    expect(service.matches("short", "a-much-longer-value-than-short")).toBe(false);
  });
});
