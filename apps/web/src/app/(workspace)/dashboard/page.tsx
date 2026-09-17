/**
 * Placeholder proving the (workspace) route group, its layout, and the
 * design tokens (globals.css) all render together. Real dashboard widgets
 * (KPI cards, pipeline, outstanding invoices, tasks, activity, charts —
 * Doc 2 §16, Doc B3 §13) are explicit non-goals for Phase 0.
 */
export default function DashboardPage() {
  return (
    <div className="space-y-2">
      <p className="mono text-xs uppercase tracking-[0.1em] text-steel">Dashboard</p>
      <h1 className="font-display text-2xl font-bold text-ink">Phase 0 foundation</h1>
      <p className="max-w-lg text-sm text-ink/70">
        This page exists to prove the App Router structure, the (workspace) route
        group, and the design-token foundation render correctly end to end. No
        dashboard widgets are implemented yet.
      </p>
    </div>
  );
}
