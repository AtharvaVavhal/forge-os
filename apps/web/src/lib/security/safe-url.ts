/**
 * Helpers for opening only safe absolute URLs (signed downloads, etc.).
 * Rejects javascript:/data:/blob: and protocol-relative URLs.
 */

export function isSafeDownloadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") return true;
    // Local/dev storage (MinIO etc.) may issue http://localhost signed URLs.
    if (
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
      process.env.NODE_ENV !== "production"
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

/** @deprecated Prefer isSafeDownloadUrl */
export function isSafeHttpsUrl(value: string): boolean {
  return isSafeDownloadUrl(value);
}

/** Opens a backend-issued signed URL in a new tab when the scheme is trusted. */
export function openTrustedHttpsUrl(url: string): boolean {
  if (!isSafeDownloadUrl(url)) return false;
  window.open(url, "_blank", "noopener,noreferrer");
  return true;
}
