import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses: Record<StatusTone, string> = {
  success: "bg-emerald-50 text-emerald-700 ring-emerald-100",
  warning: "bg-amber-50 text-amber-700 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
  info: "bg-blue-50 text-blue-700 ring-blue-100",
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
};

/**
 * Shared employee-app status chip. Uses colour + text (never colour alone),
 * so it remains accessible and readable on small screens.
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
        "inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
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
