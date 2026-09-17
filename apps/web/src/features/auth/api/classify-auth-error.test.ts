import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import { describe, expect, it } from "vitest";
import { classifyLoginFailure, isForbiddenError, isUnauthorizedError } from "./classify-auth-error";

function clientError(status: number, code: string): ApiClientError {
  return new ApiClientError(status, {
    code,
    message: "ignored",
    requestId: "req-1",
  });
}

describe("classifyLoginFailure", () => {
  it("maps 401 to invalid credentials", () => {
    expect(classifyLoginFailure(clientError(401, "UNAUTHORIZED"))).toBe("invalid_credentials");
  });

  it("maps inactive-account codes without treating the message as source of truth", () => {
    expect(classifyLoginFailure(clientError(403, "ACCOUNT_INACTIVE"))).toBe("inactive_account");
  });

  it("maps 429 to rate limited", () => {
    expect(classifyLoginFailure(clientError(429, "RATE_LIMITED"))).toBe("rate_limited");
  });

  it("maps network failures separately", () => {
    expect(classifyLoginFailure(new ApiNetworkError(new Error("offline")))).toBe("network");
  });

  it("falls back to generic for unknown server errors", () => {
    expect(classifyLoginFailure(clientError(500, "INTERNAL"))).toBe("generic");
  });
});

describe("HTTP auth helpers", () => {
  it("detects 401 and 403 by status", () => {
    expect(isUnauthorizedError(clientError(401, "UNAUTHORIZED"))).toBe(true);
    expect(isForbiddenError(clientError(403, "FORBIDDEN"))).toBe(true);
    expect(isForbiddenError(clientError(401, "UNAUTHORIZED"))).toBe(false);
  });
});
