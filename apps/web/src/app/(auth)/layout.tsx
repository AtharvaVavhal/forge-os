import { Wordmark } from "@/features/auth/components/wordmark";

/**
 * Public route group (Doc B3 §1) — no sidebar/topbar. Minimal ink stage
 * with a centered paper panel for credentials.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-surface="inverse"
      className="flex min-h-dvh flex-col items-center justify-center bg-ink px-4 py-10 text-paper sm:px-6"
    >
      <a
        href="#auth-main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:rounded-lg focus:bg-paper focus:px-3 focus:py-2 focus:text-ink"
      >
        Skip to sign in
      </a>
      <div className="mb-8">
        <Wordmark inverted />
      </div>
      <main
        id="auth-main"
        className="w-full max-w-[26rem] rounded-2xl border border-steel/20 bg-paper-elev p-6 text-ink shadow-[var(--elevation-3)] sm:p-8"
      >
        {children}
      </main>
    </div>
  );
}
