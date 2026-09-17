/**
 * Deliberately does not distinguish "doesn't exist" from "exists but you
 * don't have access" — Doc B3 §4 carries this posture forward from the
 * portal's own non-enumerating design (Document 6 §3.2's "prefer 404 for
 * IDOR resistance"). The real auth-aware forbidden-page variant is Phase 1
 * work once sessions exist.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-paper px-6 text-center">
      <p className="mono text-xs uppercase tracking-[0.1em] text-steel">Not found</p>
      <p className="max-w-sm text-sm text-ink/80">
        This page doesn&apos;t exist, or you don&apos;t have access to it.
      </p>
    </div>
  );
}
