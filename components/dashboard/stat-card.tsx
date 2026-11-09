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

/** Each tone maps to a solid gradient icon tile (see `.hris-tile-*`). */
const tileToneClasses: Record<StatTone, string> = {
  primary: "hris-tile-blue",
  "soft-blue": "hris-tile-blue",
  blue: "hris-tile-blue",
  indigo: "hris-tile-indigo",
  lavender: "hris-tile-violet",
  violet: "hris-tile-violet",
  pink: "hris-tile-pink",
  rose: "hris-tile-pink",
  coral: "hris-tile-red",
  danger: "hris-tile-red",
  peach: "hris-tile-orange",
  amber: "hris-tile-amber",
  warning: "hris-tile-amber",
  mint: "hris-tile-green",
  green: "hris-tile-green",
  success: "hris-tile-green",
  teal: "hris-tile-teal",
  info: "hris-tile-sky",
  slate: "hris-tile-slate",
};

/** A single aggregate metric card used across both dashboards.
 *
 * KPI layout: solid gradient icon tile on the left, muted label, large bold
 * metric and an optional supporting hint. `compact` is the dense variant for
 * nested lists (smaller tile, smaller metric).
 */
export function StatCard({
  icon,
  label,
  value,
  hint,
  tone = "soft-blue",
  className,
  compact = false,
}: {
  icon: HrisIconName;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
  /** Dense variant (smaller tile and metric) for nested lists. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-2xl border border-[var(--card-border)] bg-card hris-card hris-card-hover",
        compact ? "gap-3 p-3.5" : "gap-4 p-4 sm:p-5",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "hris-tile flex shrink-0 items-center justify-center",
          compact ? "size-10 rounded-xl" : "size-12 rounded-2xl sm:size-14",
          tileToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className={compact ? "size-5" : "size-6 sm:size-7"} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate font-medium text-muted-foreground",
            compact ? "text-xs" : "text-[13px]"
          )}
        >
          {label}
        </p>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span
            className={cn(
              "font-bold tracking-tight text-foreground tabular-nums",
              compact ? "text-xl leading-7" : "text-[26px] leading-8 sm:text-[28px]"
            )}
          >
            {value}
          </span>
          {hint ? (
            <span className="truncate text-xs font-medium text-muted-foreground">
              {hint}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
