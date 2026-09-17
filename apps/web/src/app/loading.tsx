/**
 * Root-level fallback only — most routes get their own route-level
 * `loading.tsx` rendering a shape-matched Skeleton once that component
 * exists (Doc B3 §1/§19, Doc 2 §11). This is the rarely-hit catch-all.
 */
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper">
      <p className="mono text-xs uppercase tracking-[0.1em] text-steel">Loading…</p>
    </div>
  );
}
