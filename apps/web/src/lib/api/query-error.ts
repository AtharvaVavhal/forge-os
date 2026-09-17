import { ApiClientError, ApiNetworkError } from "@forge/api-client";
import { isForbiddenError, isUnauthorizedError } from "@/features/auth/api/classify-auth-error";

export function isNotFoundError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 404;
}

export function isValidationError(error: unknown): boolean {
  return error instanceof ApiClientError && (error.status === 400 || error.status === 422);
}

export function isConflictError(error: unknown): boolean {
  return error instanceof ApiClientError && error.status === 409;
}

export function isNetworkError(error: unknown): boolean {
  return error instanceof ApiNetworkError;
}

export function queryErrorMessage(error: unknown): string {
  if (isUnauthorizedError(error)) {
    return "Your session expired. Sign in again.";
  }
  if (isForbiddenError(error)) {
    return "You don’t have permission to do this.";
  }
  if (isNotFoundError(error)) {
    return "This record doesn’t exist, or you don’t have access to it.";
  }
  if (isConflictError(error)) {
    return error instanceof ApiClientError ? error.message : "This change conflicts with the current record.";
  }
  if (isValidationError(error)) {
    return error instanceof ApiClientError ? error.message : "The server rejected this request.";
  }
  if (isNetworkError(error)) {
    return "We couldn’t reach the API. Check your connection and try again.";
  }
  if (error instanceof ApiClientError) {
    return error.message || "The request failed.";
  }
  return "Something went wrong. Try again.";
}
