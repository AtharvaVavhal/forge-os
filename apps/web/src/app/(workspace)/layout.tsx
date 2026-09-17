/**
 * Protected route group (Doc B3 §1/§3) — will hold the app shell (Sidebar +
 * TopBar + Command Palette provider) and the server-side session guard that
 * redirects to (auth)/login on an invalid/missing session.
 *
 * Phase 0 renders unconditionally. There is deliberately NO auth check
 * here yet: Implementation Phase 0's brief is explicit that authentication
 * is not implemented until Phase 1, and a layout that pretended to guard
 * this route group without a real session to check would be worse than no
 * guard at all — it would look like a security boundary that isn't one.
 * The shell below (a minimal placeholder, not the real Sidebar/TopBar from
 * Doc 2 §9) exists only to prove the route group and its layout render.
 */
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="flex h-14 items-center border-b border-steel/20 bg-paper-elev px-6">
        <p className="font-display text-sm font-semibold">FORGE Business OS</p>
        <p className="mono ml-4 text-xs text-steel">
          Phase 0 foundation — sidebar/topbar/command palette arrive in Phase 2
        </p>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
