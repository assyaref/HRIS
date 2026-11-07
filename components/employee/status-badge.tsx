import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "hris-surface-success text-success ring-1 ring-inset ring-success/20",
  warning: "hris-surface-warning text-warning ring-1 ring-inset ring-warning/20",
  danger: "hris-surface-danger text-danger ring-1 ring-inset ring-danger/20",
  info: "hris-surface-info text-info ring-1 ring-inset ring-info/20",
  neutral: "bg-muted text-muted-foreground ring-1 ring-inset ring-muted/30",
};

/**
 * Shared employee-app status chip. Uses colour + text (never colour alone),
 * so it remains accessible and readable on small screens. Theme-adaptive.
 */
export function StatusBadge({
  tone = "neutral",
  children,
  icon,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
        className
      )}
    >
      {icon ? <span aria-hidden="true">{icon}</span> : null}
      {children}
    </span>
  );
}

/** Map an attendance/leave/payslip status string to a tone + label. */
export function statusTone(status: string): StatusTone {
  switch (status) {
    case "present":
    case "completed":
    case "approved":
    case "published":
    case "verified":
    case "valid":
      return "success";
    case "incomplete":
    case "pending":
    case "processing":
      return "warning";
    case "rejected":
    case "failed":
    case "outside_geofence":
      return "danger";
    default:
      return "neutral";
  }
}
