import { cn } from "@/lib/cn";

export type StatusTone = "success" | "danger" | "warning" | "info" | "neutral" | "pending";

const toneClass: Record<StatusTone, string> = {
  success: "bg-success-soft text-success-deep",
  danger: "bg-danger-soft text-danger-deep",
  warning: "bg-warning-soft text-warning-deep",
  info: "bg-info-soft text-info-deep",
  neutral: "bg-steel/[0.08] text-steel",
  pending: "border border-dashed border-steel/40 bg-steel/[0.06] text-steel",
};

export function StatusBadge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 font-display text-[length:var(--text-body-small-size)] font-medium",
        toneClass[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
