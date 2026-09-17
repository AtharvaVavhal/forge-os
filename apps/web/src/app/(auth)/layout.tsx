/**
 * Public route group (Doc B3 §1) — no sidebar/topbar, no auth guard (there's
 * nothing to guard against yet). Minimal centered shell, proving the route
 * group boundary exists ahead of Phase 1's real login flow.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink px-6 text-paper">
      {children}
    </div>
  );
}
