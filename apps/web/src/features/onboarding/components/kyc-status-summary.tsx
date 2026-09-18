import { StatusBadge } from "@/components/feedback/status-badge";
import { kycStatusCopy } from "../lib/kyc-status-copy";
import type { KycProfile } from "../api/types";

/**
 * Status badge + human-readable message (+ rejection reason, if any).
 * Deliberately shows nothing beyond status: no PAN, government ID,
 * document contents/URLs, or payout details belong on this summary.
 */
export function KycStatusSummary({ profile }: { profile: KycProfile | null }) {
  const copy = kycStatusCopy(profile?.status ?? null);
  return (
    <div className="flex flex-col gap-2">
      <StatusBadge tone={copy.tone}>{copy.label}</StatusBadge>
      <p className="type-body text-ink/70">{copy.message}</p>
      {profile?.status === "REJECTED" && profile.rejectionReason ? (
        <p className="type-helper text-danger-deep">{profile.rejectionReason}</p>
      ) : null}
    </div>
  );
}
