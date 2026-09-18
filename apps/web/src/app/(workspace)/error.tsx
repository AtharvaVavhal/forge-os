"use client";

export default function WorkspaceError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-start justify-center gap-4">
      <p className="mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-danger-deep">
        Workspace unavailable
      </p>
      <p className="font-display max-w-md text-[length:var(--text-body-size)] text-ink/80">
        The workspace couldn’t load. Your session may still be valid — try again.
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
