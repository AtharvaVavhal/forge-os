import { describe, expect, it } from "vitest";
import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import { queryErrorMessage } from "./query-error";

describe("queryErrorMessage", () => {
  it("maps 401 to session expiry copy", () => {
    expect(
      queryErrorMessage(new ApiClientError(401, { code: "UNAUTHORIZED", message: "no", requestId: "r" }))
    ).toBe("Your session expired. Sign in again.");
  });

  it("maps 403 without describing the resource", () => {
    expect(
      queryErrorMessage(new ApiClientError(403, { code: "FORBIDDEN", message: "hidden", requestId: "r" }))
    ).toBe("You don’t have permission to do this.");
  });

  it("maps 422 to the backend validation message", () => {
    expect(
      queryErrorMessage(
        new ApiClientError(422, { code: "VALIDATION_ERROR", message: "GSTIN is invalid.", requestId: "r" })
      )
    ).toBe("GSTIN is invalid.");
  });

  it("maps network failures to a connection message", () => {
    expect(queryErrorMessage(new ApiNetworkError(new Error("offline")))).toBe(
      "We couldn’t reach the API. Check your connection and try again."
    );
  });
});
