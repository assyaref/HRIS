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

/** Each tone maps to a pastel icon well (see `.hris-chip-*`). */
const chipToneClasses: Record<StatTone, string> = {
  primary: "hris-chip-blue",
  "soft-blue": "hris-chip-blue",
  blue: "hris-chip-blue",
  indigo: "hris-chip-indigo",
  lavender: "hris-chip-violet",
  violet: "hris-chip-violet",
  pink: "hris-chip-rose",
  rose: "hris-chip-rose",
  coral: "hris-chip-rose",
  danger: "hris-chip-rose",
  peach: "hris-chip-amber",
  amber: "hris-chip-amber",
  warning: "hris-chip-amber",
  mint: "hris-chip-green",
  green: "hris-chip-green",
  success: "hris-chip-green",
  teal: "hris-chip-teal",
  info: "hris-chip-sky",
  slate: "hris-chip-slate",
};

/** A single aggregate metric card used across dashboards and reports.
 *
 * HRIS Lite v2: pastel round icon well on the left, small uppercase blue
 * label, large bold metric and an optional hint with a green status dot.
 * `compact` is the dense variant for nested lists.
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
  /** Dense variant (smaller well and metric) for nested lists. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center rounded-[18px] border border-[var(--card-border)] bg-card hris-card hris-card-hover",
        compact ? "gap-3 p-3.5" : "gap-4 p-4 sm:px-5 sm:py-[18px]",
        className
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full",
          compact ? "size-10" : "size-14",
          chipToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className={compact ? "size-5" : "size-7"} />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "leading-tight font-semibold tracking-wide text-primary uppercase",
            compact ? "text-[10px]" : "text-[11px]"
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "font-extrabold tracking-tight text-foreground tabular-nums",
            compact ? "text-xl leading-7" : "mt-0.5 text-[26px] leading-8"
          )}
        >
          {value}
        </p>
        {hint ? (
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] font-medium text-muted-foreground">
            <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full border-2 border-[#22C55E]" />
            {hint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
