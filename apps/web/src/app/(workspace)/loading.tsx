/**
 * Demonstrates the per-segment loading.tsx pattern Doc B3 §1 calls for
 * (route-level, not just the root fallback). Once the Skeleton primitive
 * exists (Phase 2, Doc 2 §11), this becomes a shape-matched skeleton
 * instead of a bare label.
 */
export default function WorkspaceLoading() {
  return <p className="mono text-xs uppercase tracking-[0.1em] text-steel">Loading…</p>;
}
