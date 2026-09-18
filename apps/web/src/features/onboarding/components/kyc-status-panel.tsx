"use client";

import { useQuery } from "@tanstack/react-query";
import { Card, CardHeader } from "@/components/ui/card";
import { LoadingState, ErrorState } from "@/components/data-display/data-states";
import { isUnauthorizedError } from "@/features/auth/api/classify-auth-error";
import { queryErrorMessage } from "@/lib/api/query-error";
import { formatDate } from "@/features/crm/format";
import { getOwnKycProfile } from "../api/kyc-api";
import { onboardingQueryKeys } from "../api/query-keys";
import { KycStatusSummary } from "./kyc-status-summary";

/**
 * Read-only KYC status view for Settings → Profile. This is the landing
 * target for the dashboard's "View verification" action: /onboarding
 * redirects straight back to /dashboard once onboardedAt is true (see
 * requireOnboardingSession), which is always the case for anyone who could
 * reach the dashboard card in the first place — so /onboarding can never be
 * a working destination here. Shows status, dates, and (for REJECTED) the
 * rejection reason only — no PAN, government ID, documents, or payout data.
 */
export function KycStatusPanel() {
  const kyc = useQuery({
    queryKey: onboardingQueryKeys.kyc(),
    queryFn: getOwnKycProfile,
  });

  if (kyc.isPending) {
    return (
      <Card>
        <CardHeader kicker="Settings" title="KYC & Verification" />
        <LoadingState label="Loading verification status" />
      </Card>
    );
  }

  if (kyc.isError) {
    if (isUnauthorizedError(kyc.error)) {
      return <ErrorState title="Session expired">{queryErrorMessage(kyc.error)}</ErrorState>;
    }
    return <ErrorState>{queryErrorMessage(kyc.error)}</ErrorState>;
  }

  const profile = kyc.data;

  return (
    <Card>
      <CardHeader
        kicker="Settings"
        title="KYC & Verification"
        description="Forge verifies your identity once, using the details you submitted during onboarding."
      />
      <div className="flex flex-col gap-4">
        <KycStatusSummary profile={profile} />
        {profile?.submittedAt || profile?.verifiedAt || profile?.rejectedAt ? (
          <dl className="grid gap-2 border-t border-steel/15 pt-4 sm:grid-cols-2">
            {profile.submittedAt ? (
              <div>
                <dt className="type-mono-label text-steel">Submitted on</dt>
                <dd className="type-body mt-1 text-ink">{formatDate(profile.submittedAt)}</dd>
              </div>
            ) : null}
            {profile.verifiedAt ? (
              <div>
                <dt className="type-mono-label text-steel">Verified on</dt>
                <dd className="type-body mt-1 text-ink">{formatDate(profile.verifiedAt)}</dd>
              </div>
            ) : null}
            {profile.rejectedAt ? (
              <div>
                <dt className="type-mono-label text-steel">Reviewed on</dt>
                <dd className="type-body mt-1 text-ink">{formatDate(profile.rejectedAt)}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </div>
    </Card>
  );
}
