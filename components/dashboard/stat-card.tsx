import type { ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export type StatTone =
  | "primary"
  | "soft-blue"
  | "indigo"
  | "lavender"
  | "pink"
  | "coral"
  | "peach"
  | "amber"
  | "mint"
  | "teal"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "slate"
  | "blue"
  | "green"
  | "rose"
  | "violet";

const iconToneClasses: Record<StatTone, string> = {
  primary: "bg-surface-primary text-accent-foreground",
  "soft-blue": "bg-surface-soft-blue text-accent-foreground",
  indigo: "bg-surface-indigo text-accent-foreground",
  lavender: "bg-surface-lavender text-accent-foreground",
  pink: "bg-surface-pink text-accent-foreground",
  coral: "bg-surface-coral text-accent-foreground",
  peach: "bg-surface-peach text-accent-foreground",
  amber: "bg-surface-amber text-accent-foreground",
  mint: "bg-surface-mint text-accent-foreground",
  teal: "bg-surface-teal text-accent-foreground",
  success: "bg-surface-success text-success",
  warning: "bg-surface-warning text-warning",
  danger: "bg-surface-danger text-danger",
  info: "bg-surface-info text-info",
  slate: "bg-muted text-muted-foreground",
  blue: "bg-surface-soft-blue text-primary",
  green: "bg-surface-mint text-info",
  rose: "bg-surface-pink text-danger",
  violet: "bg-surface-indigo text-primary",
};

/** A single aggregate metric card used across both dashboards. */
export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "soft-blue",
  className,
}: {
  icon: HrisIconName;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-[20px] border border-border bg-card p-4 hris-card-hover",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-[12px]",
          iconToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className="size-4.5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[11px] font-medium text-muted-foreground uppercase tracking-[0.08em]">
          {label}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-lg font-semibold tracking-tight text-foreground">
            {value}
          </span>
          {hint ? (
            <span className="truncate text-xs text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
