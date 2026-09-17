import { Button } from "@/components/ui/button";

export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-2">
        <p className="type-mono-label text-steel">{kicker}</p>
        <h1 className="type-page-title text-ink">{title}</h1>
        {description ? <p className="type-body max-w-2xl text-ink/70">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}

export function FactList({
  items,
}: {
  items: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="grid gap-4 sm:grid-cols-2">
      {items.map((item) => (
        <div key={item.label} className="border-t border-steel/15 pt-3">
          <dt className="type-mono-label text-steel">{item.label}</dt>
          <dd className="font-display mt-1 text-[length:var(--text-body-size)] text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function FormActions({
  onCancel,
  pending,
  submitLabel,
}: {
  onCancel: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
        Cancel
      </Button>
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </div>
  );
}
