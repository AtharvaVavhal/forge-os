/** Mask helpers for Finance KYC review UI — display only. */

export function maskPan(pan: string | null | undefined): string {
  if (!pan || pan.length < 5) return "••••••••••";
  return `XXXXX${pan.toUpperCase().slice(5)}`;
}

export function maskAccountNumber(account: string | null | undefined): string {
  if (!account) return "••••";
  return `••••••${account.slice(-4)}`;
}

export function maskIdNumber(value: string | null | undefined): string {
  if (!value || value.length < 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function maskUpi(upi: string | null | undefined): string {
  if (!upi) return "••••";
  const at = upi.indexOf("@");
  if (at <= 0) return "••••";
  return `${upi[0]}•••${upi.slice(at)}`;
}

export function maskIfsc(ifsc: string | null | undefined): string {
  if (!ifsc || ifsc.length < 6) return "•••••••••••";
  const upper = ifsc.toUpperCase();
  return `${upper.slice(0, 4)}••••••${upper.slice(-2)}`;
}
