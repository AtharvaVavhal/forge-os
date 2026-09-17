import { ApiClientError } from "@forge/api-client";
import type { ApiErrorEnvelope } from "@forge/types";

export async function parseApiResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const text = await response.text();
  const json: unknown = text.length > 0 ? JSON.parse(text) : undefined;

  if (!response.ok) {
    const envelope = json as Partial<ApiErrorEnvelope> | undefined;
    if (envelope?.error) {
      throw new ApiClientError(response.status, envelope.error);
    }
    throw new ApiClientError(response.status, {
      code: "UNKNOWN_ERROR",
      message: `Request failed with status ${response.status}.`,
      requestId: response.headers.get("x-request-id") ?? "",
    });
  }

  return json as T;
}
