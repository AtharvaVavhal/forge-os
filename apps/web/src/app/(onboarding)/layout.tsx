/**
 * First-run onboarding surfaces — full-bleed paper, no workspace chrome.
 */
export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-paper text-ink">{children}</div>;
}
