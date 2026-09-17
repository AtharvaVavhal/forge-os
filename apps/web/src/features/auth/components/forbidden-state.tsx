import Link from "next/link";
import { EmptyState } from "@/components/data-display/empty-state";

/**
 * Non-enumerating forbidden/unavailable record page (Doc B3 §4 / §5 / §19).
 * Copy matches not-found on purpose: the UI does not distinguish "missing"
 * from "exists but you cannot see it".
 */
export function ForbiddenState({
  compact = false,
}: {
  compact?: boolean;
}) {
  return (
    <EmptyState
      kicker="Unavailable"
      title="This page doesn’t exist, or you don’t have access to it."
      description="If you followed a link, it may have expired or may be outside your role."
      className={compact ? "min-h-[16rem]" : "min-h-[24rem]"}
      action={
        <Link
          href="/dashboard"
          className="font-display inline-flex h-9 min-h-9 items-center justify-center rounded-full border border-steel/20 px-4 text-[length:var(--text-button-size)] font-semibold text-ink transition-transform duration-[var(--duration-fast)] ease-[var(--ease-out-forge)] motion-safe:hover:scale-[1.02] hover:bg-ink/[0.04]"
        >
          Back to dashboard
        </Link>
      }
    />
  );
}
