"use client";

export default function LoginError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-danger-deep">
        Sign-in unavailable
      </p>
      <p className="font-display text-[length:var(--text-body-size)] text-ink/80">
        {error.message || "The sign-in page failed to load. Try again."}
      </p>
      <button
        type="button"
        onClick={reset}
        className="font-display h-11 rounded-full bg-ember-deep px-6 text-sm font-semibold text-paper"
      >
        Try again
      </button>
    </div>
  );
}
