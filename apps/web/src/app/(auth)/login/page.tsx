/**
 * Placeholder proving the (auth) route group and its layout render
 * correctly. The real login form (email/password + "Continue with Google
 * Workspace", per Document 6 §4.1) is Phase 1 work — it needs the auth
 * module and session endpoints to exist first.
 */
export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <p className="mono text-xs uppercase tracking-[0.1em] text-paper/50">FORGE Business OS</p>
      <h1 className="font-display text-2xl font-bold">Sign in</h1>
      <p className="max-w-xs text-sm text-paper/70">
        Authentication is implemented in Phase 1. This route exists to prove the
        (auth) route group and its layout.
      </p>
    </div>
  );
}
