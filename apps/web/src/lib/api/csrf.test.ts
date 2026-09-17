import { describe, expect, it } from "vitest";
import { CSRF_COOKIE_NAME, readCsrfToken } from "./csrf";

describe("readCsrfToken", () => {
  it("returns undefined when the CSRF cookie is absent", () => {
    expect(readCsrfToken("forge_session=abc")).toBeUndefined();
  });

  it("reads the non-httpOnly CSRF cookie the backend issues", () => {
    expect(readCsrfToken(`${CSRF_COOKIE_NAME}=token%2Dvalue; other=1`)).toBe("token-value");
  });
});
