/**
 * Resolve Express `trust proxy` for rate limiting (`req.ip`) and secure
 * cookie semantics behind a reverse proxy.
 *
 * Never accepts `true` (trust every hop). Prefer an explicit hop count —
 * typically `1` when a single TLS terminator / load balancer sits in front
 * of the Nest process.
 */
export type TrustProxySetting = false | number;

export function resolveTrustProxyHops(
  env: "development" | "test" | "production",
  raw: string | undefined
): TrustProxySetting {
  const value = raw?.trim();
  if (value === undefined || value === "") {
    // Production topology assumes one trusted reverse proxy. Local/dev
    // connects directly — do not honor X-Forwarded-* by default.
    return env === "production" ? 1 : false;
  }
  if (value === "false" || value === "0") {
    return false;
  }
  if (value === "true") {
    throw new Error(
      "TRUST_PROXY=true is not allowed. Set an explicit hop count (1–5), typically TRUST_PROXY=1 behind a single reverse proxy."
    );
  }
  const hops = Number.parseInt(value, 10);
  if (!Number.isInteger(hops) || hops < 1 || hops > 5) {
    throw new Error(
      "TRUST_PROXY must be an integer hop count from 1 to 5, or false/0 to disable."
    );
  }
  return hops;
}
