/** Display-only INR formatting of a server decimal string. No arithmetic. */
export function formatInr(amount: string): string {
  const negative = amount.startsWith("-");
  const unsigned = negative ? amount.slice(1) : amount;
  const [wholeRaw = "0", fraction] = unsigned.split(".");
  const whole = wholeRaw.replace(/^0+(?=\d)/, "") || "0";
  const grouped = groupIndian(whole);
  const body = fraction !== undefined ? `${grouped}.${fraction}` : grouped;
  return `${negative ? "-" : ""}₹${body}`;
}

function groupIndian(whole: string): string {
  if (whole.length <= 3) return whole;
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const pairs = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return `${pairs},${lastThree}`;
}
