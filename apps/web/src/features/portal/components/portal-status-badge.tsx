import { StatusBadge, type StatusTone } from "@/components/feedback/status-badge";

const statusToneMap: Record<string, StatusTone> = {
  ACTIVE: "success",
  COMPLETED: "success",
  PAID: "success",
  ACCEPTED: "success",
  RESOLVED: "success",
  CLOSED: "success",
  SENT: "info",
  VIEWED: "info",
  IN_PROGRESS: "info",
  OPEN: "info",
  PARTIALLY_PAID: "warning",
  AWAITING_APPROVAL: "warning",
  WAITING_ON_CLIENT: "warning",
  AT_RISK: "warning",
  REOPENED: "warning",
  ON_HOLD: "neutral",
  DRAFT: "neutral",
  PENDING: "pending",
  EXPIRED: "neutral",
  VOID: "neutral",
  CANCELLED: "danger",
  REJECTED: "danger",
  OVERDUE: "danger",
  FAILED: "danger",
  REVERSED: "danger",
};

export function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ");
}

export function PortalStatusBadge({ status }: { status: string }) {
  const tone = statusToneMap[status.toUpperCase()] ?? "neutral";
  return <StatusBadge tone={tone}>{formatStatusLabel(status)}</StatusBadge>;
}
