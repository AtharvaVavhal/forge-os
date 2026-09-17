import { formatInr } from "@/lib/money/format-inr";

export function MoneyText({
  value,
  fallback = "—",
}: {
  value: string | null | undefined;
  fallback?: string;
}) {
  if (!value) {
    return <span className="tabular-nums text-[var(--forge-ink-muted,#78736a)]">{fallback}</span>;
  }
  return <span className="tabular-nums">{formatInr(value)}</span>;
}
