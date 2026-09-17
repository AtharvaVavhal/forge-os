import { cn } from "@/lib/cn";

const toneClass = {
  danger: "border-danger-deep/30 bg-danger-soft text-danger-deep",
  info: "border-info-deep/30 bg-info-soft text-info-deep",
  warning: "border-warning-deep/30 bg-warning-soft text-warning-deep",
  success: "border-success-deep/30 bg-success-soft text-success-deep",
} as const;

export function Alert({
  tone = "danger",
  title,
  children,
  className,
  id,
}: {
  tone?: keyof typeof toneClass;
  title?: string;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      role="alert"
      tabIndex={id ? -1 : undefined}
      className={cn("rounded-lg border px-4 py-3 text-left", toneClass[tone], className)}
    >
      {title ? (
        <p className="font-display text-[length:var(--text-label-size)] font-semibold">{title}</p>
      ) : null}
      <div className="font-display text-[length:var(--text-body-small-size)] leading-[var(--text-body-small-leading)]">
        {children}
      </div>
    </div>
  );
}
