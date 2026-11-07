import Link from "next/link";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export type QuickServiceTone =
  | "blue"
  | "cyan"
  | "green"
  | "amber"
  | "violet"
  | "rose"
  | "slate";

const toneClasses: Record<QuickServiceTone, string> = {
  blue: "hris-surface-primary text-primary",
  cyan: "hris-surface-info text-info",
  green: "hris-surface-success text-success",
  amber: "hris-surface-warning text-warning",
  violet: "hris-surface-info text-info",
  rose: "hris-surface-danger text-danger",
  slate: "bg-muted text-muted-foreground",
};

export interface QuickServiceItem {
  href: string;
  icon: HrisIconName;
  label: string;
  tone?: QuickServiceTone;
  badge?: string | number | null;
}

/**
 * A single "Layanan Aplikasi" tile. White card, rounded, subtle shadow,
 * icon container + label. Touch target is at least 44px tall. Theme-adaptive.
 */
export function QuickServiceCard({ item }: { item: QuickServiceItem }) {
  return (
    <Link
      href={item.href}
      className={cn(
        "hris-card emp-card-tap group flex min-h-[5.5rem] flex-col items-center justify-center gap-2 px-2 py-3 text-center focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
        item.badge ? "group-hover:border-primary/50" : "border-transparent"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-11 items-center justify-center rounded-2xl mb-1",
          toneClasses[item.tone ?? "blue"]
        )}
      >
        <HrisIcon name={item.icon} className="size-5.5" />
        {item.badge ? (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs leading-tight font-medium text-foreground">
        {item.label}
      </span>
    </Link>
  );
}
