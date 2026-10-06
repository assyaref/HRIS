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
  blue: "bg-blue-50 text-blue-600",
  cyan: "bg-cyan-50 text-cyan-600",
  green: "bg-emerald-50 text-emerald-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
  rose: "bg-rose-50 text-rose-600",
  slate: "bg-slate-100 text-slate-600",
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
 * icon container + label. Touch target is at least 44px tall.
 */
export function QuickServiceCard({ item }: { item: QuickServiceItem }) {
  return (
    <Link
      href={item.href}
      className="emp-card emp-card-tap group flex min-h-[5.5rem] flex-col items-center justify-center gap-2 px-2 py-3 text-center focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:ring-offset-2 focus-visible:outline-none"
    >
      <span
        aria-hidden="true"
        className={cn(
          "relative flex size-11 items-center justify-center rounded-2xl",
          toneClasses[item.tone ?? "blue"]
        )}
      >
        <HrisIcon name={item.icon} className="size-5.5" />
        {item.badge ? (
          <span className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-[#1677e8] px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {item.badge}
          </span>
        ) : null}
      </span>
      <span className="text-xs leading-tight font-medium text-[#172554]">
        {item.label}
      </span>
    </Link>
  );
}
