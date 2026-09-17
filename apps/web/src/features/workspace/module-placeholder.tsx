import { EmptyState } from "@/components/data-display/empty-state";

export function ModulePlaceholder({
  kicker,
  title,
  description,
}: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <p className="type-mono-label text-steel">{kicker}</p>
        <h1 className="type-page-title text-ink">{title}</h1>
      </header>
      <EmptyState
        kicker="Coming in a later phase"
        title={`${title} is not connected yet`}
        description={description}
      />
    </div>
  );
}
