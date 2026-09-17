import { createApiClient } from "@forge/api-client";
import { getBrowserApiBaseUrl } from "./base-url";

/**
 * The one instantiation of the generic client boundary (Doc B3 §6/§7).
 * Browser calls use same-origin `/api/v1` (rewritten to the API) so
 * `credentials: "include"` sends the httpOnly session cookie. The client
 * never reads or stores tokens.
 */
export const apiClient = createApiClient({
  baseUrl: getBrowserApiBaseUrl(),
});
