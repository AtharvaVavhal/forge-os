import { createApiClient } from "@forge/api-client";

/**
 * The one instantiation of the generic client boundary (Doc B3 §6/§7,
 * Step 7). Every future feature's data-fetching hook imports `apiClient`
 * from here — nothing calls `fetch()` directly against the API from inside
 * a component.
 */
export const apiClient = createApiClient({
  baseUrl: process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api/v1",
});
