import { formatInr } from "@/lib/money/format-inr";

export function MoneyText({
  value,
  fallback = "—",
}: {
  value: string | null | undefined;
  fallback?: string;
}) {
  if (!value) {
    return <span className="tabular-nums text-steel">{fallback}</span>;
  }
  return <span className="tabular-nums">{formatInr(value)}</span>;
}
