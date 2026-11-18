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

/** Solid gradient icon tile + matching corner glow (see `.hris-tile-*`). */
const tileToneClasses: Record<StatTone, string> = {
  primary: "hris-tile-blue",
  "soft-blue": "hris-tile-blue",
  blue: "hris-tile-blue",
  indigo: "hris-tile-indigo",
  lavender: "hris-tile-violet",
  violet: "hris-tile-violet",
  pink: "hris-tile-pink",
  rose: "hris-tile-red",
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
  if (compact) {
    return (
      <div
        className={cn(
          "flex items-center gap-3 rounded-2xl border border-[var(--card-border)] bg-card p-3.5 hris-card hris-card-hover",
          className
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            chipToneClasses[tone]
          )}
        >
          <HrisIcon name={icon} className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xl leading-7 font-bold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          <p className="truncate text-[12px] font-medium text-muted-foreground">
            {label}
          </p>
          {hint ? (
            <p className="truncate text-[11px] text-muted-foreground">{hint}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative isolate flex min-h-[136px] flex-col overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-card p-5 hris-card hris-card-hover",
        className
      )}
    >
      {/* Faint tone wash in the corner. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -right-12 -bottom-14 -z-10 size-36 rounded-full opacity-[0.08] blur-xl",
          tileToneClasses[tone]
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[28px] leading-none font-bold tracking-tight text-foreground tabular-nums">
            {value}
          </p>
          <p className="mt-2.5 truncate text-[15px] font-medium text-foreground/80">
            {label}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={cn(
            "hris-tile flex size-11 shrink-0 items-center justify-center rounded-2xl",
            tileToneClasses[tone]
          )}
        >
          <HrisIcon name={icon} className="size-[22px]" />
        </span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <p className="min-w-0 truncate text-[12.5px] text-muted-foreground">
          {hint ?? "Data terkini"}
        </p>
        <span
          aria-hidden="true"
          className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[#22C55E] text-white shadow-[0_0_0_4px_rgb(34_197_94/0.15)]"
        >
          <HrisIcon name="arrow-right" className="size-3.5 -rotate-45" />
        </span>
      </div>
    </div>
  );
}
