import { ApiClientError } from "@forge/api-client";
import { apiClient } from "@/lib/api/client";
import { parseBankDirectoryLookup, parseBankSearchHits } from "./parse";
import { sharedPaths } from "./paths";
import type { BankDirectoryLookup, BankSearchHit } from "./types";

/** K10 — searchable bank name suggestions. Backend enforces the 2-char minimum too. */
export async function searchBanks(q: string): Promise<BankSearchHit[]> {
  if (q.trim().length < 2) return [];
  const payload = await apiClient.get<unknown>(sharedPaths.bankSearch, { query: { q } });
  return parseBankSearchHits(payload) ?? [];
}

/**
 * K10 — resolves an IFSC to safe directory metadata. Returns `null` for both
 * a malformed format and an IFSC the directory doesn't cover — the caller
 * already validates format client-side, and either way there's nothing to
 * show but "couldn't verify this IFSC".
 */
export async function lookupIfsc(ifsc: string): Promise<BankDirectoryLookup | null> {
  try {
    const payload = await apiClient.get<unknown>(sharedPaths.bankIfsc(ifsc));
    return parseBankDirectoryLookup(payload);
  } catch (error) {
    if (error instanceof ApiClientError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
}
