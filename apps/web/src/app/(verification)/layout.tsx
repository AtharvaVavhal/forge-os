/**
 * Financial Verification — full-bleed paper, no workspace chrome, matching
 * the onboarding surfaces. Reachable any time after onboarding (unlike
 * `(onboarding)`, which is first-run only and redirects once onboarded).
 */
export default function VerificationLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
}
