import type { ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export type StatTone = "primary" | "blue" | "green" | "amber" | "rose" | "slate";

const iconToneClasses: Record<StatTone, string> = {
  primary: "bg-primary text-primary-foreground",
  blue: "bg-secondary text-secondary-foreground",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
};

/** A single aggregate metric card used across both dashboards. */
export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "blue",
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
        "flex items-center gap-4 rounded-xl border border-border bg-card p-4 shadow-sm",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          iconToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-muted-foreground">
          {label}
        </p>
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xl font-semibold tracking-tight text-foreground">
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