"use client";

/**
 * Root-level error boundary. Domain segments get their own `error.tsx`
 * (Doc B3 §1/§19) so one module's failure doesn't take down the whole
 * shell — this is the top-level catch-all.
 *
 * Never render raw `error.message` — it can include internal details.
 */
export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <p className="mono text-xs uppercase tracking-[0.1em] text-danger-deep">Something went wrong</p>
      <p className="max-w-md text-sm text-ink/80">
        An unexpected error occurred. Please try again.
      </p>
      <button
        type="button"
        onClick={reset}
        className="font-display rounded-full bg-ember-deep px-6 py-3 text-sm font-semibold text-paper"
      >
        Try again
      </button>
    </div>
  );
}
