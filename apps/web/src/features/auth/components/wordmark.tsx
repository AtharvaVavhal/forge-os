export function Wordmark({
  inverted = false,
}: {
  inverted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <p
        className={
          inverted
            ? "mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-paper/50"
            : "mono text-[length:var(--text-mono-label-size)] uppercase tracking-[var(--text-mono-label-tracking)] text-steel"
        }
      >
        Business OS
      </p>
      <p
        className={
          inverted
            ? "font-display text-[length:var(--text-page-title-size)] font-bold leading-[var(--text-page-title-leading)] tracking-[var(--text-page-title-tracking)] text-paper"
            : "font-display text-[length:var(--text-page-title-size)] font-bold leading-[var(--text-page-title-leading)] tracking-[var(--text-page-title-tracking)] text-ink"
        }
      >
        FORGE
      </p>
    </div>
  );
}
