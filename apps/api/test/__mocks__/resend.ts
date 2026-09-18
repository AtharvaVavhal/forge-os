/**
 * Manual mock for the `resend` package, wired via `moduleNameMapper` (see
 * apps/api/package.json's `jest` block and test/jest-e2e.json) — no real
 * network calls to Resend occur in any test run.
 */

export interface MockSentEmail {
  from: string;
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
}

export interface MockResendErrorInput {
  message: string;
  name: string;
}

export const mockSentEmails: MockSentEmail[] = [];

let queuedError: { message: string; name: string; statusCode: number | null } | null = null;
let queuedThrow: Error | null = null;

/** Call in `beforeEach`/`afterEach` for any test that asserts on sent emails or queues a failure. */
export function resetMockResend(): void {
  mockSentEmails.length = 0;
  queuedError = null;
  queuedThrow = null;
}

/** The next `send()` call resolves with `{ data: null, error }`, matching Resend's own shape. */
export function queueMockResendError(error: MockResendErrorInput): void {
  queuedError = { statusCode: 500, ...error };
}

/** The next `send()` call rejects (simulates a network-level failure, not an API error response). */
export function queueMockResendThrow(error: Error): void {
  queuedThrow = error;
}

export class Resend {
  constructor(_apiKey?: string) {
    void _apiKey;
  }

  emails = {
    send: (payload: MockSentEmail) => {
      if (queuedThrow) {
        const err = queuedThrow;
        queuedThrow = null;
        return Promise.reject(err);
      }
      if (queuedError) {
        const err = queuedError;
        queuedError = null;
        return Promise.resolve({ data: null, error: err, headers: null });
      }
      mockSentEmails.push(payload);
      return Promise.resolve({ data: { id: "mock-email-id" }, error: null, headers: null });
    },
  };
}
