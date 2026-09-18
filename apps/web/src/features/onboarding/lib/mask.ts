/** Mask PAN as XXXXX1234X (show last 5 chars of AAAAA9999A). */
export function maskPan(pan: string | null | undefined): string {
  if (!pan || pan.length < 5) return "••••••••••";
  const upper = pan.toUpperCase();
  return `XXXXX${upper.slice(5)}`;
}

export function maskAccountNumber(account: string | null | undefined): string {
  if (!account) return "••••";
  const last = account.slice(-4);
  return `••••••${last}`;
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

/** Mask IFSC as HDFC••••••34 (bank code + last 2). */
export function maskIfsc(ifsc: string | null | undefined): string {
  if (!ifsc || ifsc.length < 6) return "•••••••••••";
  const upper = ifsc.toUpperCase();
  return `${upper.slice(0, 4)}••••••${upper.slice(-2)}`;
}
