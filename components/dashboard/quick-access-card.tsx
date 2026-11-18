import Link from "next/link";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

export type QuickAccessTone =
  | "soft-blue"
  | "mint"
  | "lavender"
  | "peach"
  | "indigo"
  | "teal"
  | "pink";

const iconToneClasses: Record<QuickAccessTone, string> = {
  "soft-blue": "hris-tile-blue",
  mint: "hris-tile-green",
  lavender: "hris-tile-violet",
  peach: "hris-tile-orange",
  indigo: "hris-tile-indigo",
  teal: "hris-tile-teal",
  pink: "hris-tile-pink",
};

interface QuickAccessCardProps {
  href: string;
  icon: HrisIconName;
  title: string;
  description: string;
  tone: QuickAccessTone;
}

/**
 * Horizontal shortcut card for "Akses Cepat" (HRIS Lite v2): pastel icon
 * well, bold module title with a short description, arrow on the right.
 */
export function QuickAccessCard({
  href,
  icon,
  title,
  description,
  tone,
}: QuickAccessCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group relative isolate flex min-h-[76px] w-full items-center gap-4 overflow-hidden rounded-[18px] border border-[var(--card-border)] bg-card px-4 py-3.5 hris-card hris-card-hover",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      {/* Tone wash that fades in on hover. */}
      <span
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute -bottom-12 -left-12 -z-10 size-36 rounded-full opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-20",
          iconToneClasses[tone]
        )}
      />
      <span
        aria-hidden="true"
        className={cn(
          "hris-tile flex size-[52px] shrink-0 items-center justify-center rounded-2xl transition-transform duration-200 group-hover:scale-105 group-hover:-rotate-3",
          iconToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className="size-[26px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base font-bold tracking-tight text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-[13px] text-muted-foreground">
          {description}
        </span>
      </span>
      <span
        aria-hidden="true"
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground transition-[background-color,color,transform] group-hover:translate-x-0.5 group-hover:bg-primary group-hover:text-primary-foreground"
      >
        <HrisIcon name="arrow-right" className="size-4" />
      </span>
    </Link>
  );
}
