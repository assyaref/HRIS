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
  "soft-blue": "hris-chip-blue",
  mint: "hris-chip-green",
  lavender: "hris-chip-violet",
  peach: "hris-chip-amber",
  indigo: "hris-chip-indigo",
  teal: "hris-chip-teal",
  pink: "hris-chip-rose",
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
        "group flex min-h-[76px] w-full items-center gap-4 rounded-[18px] border border-[var(--card-border)] bg-card px-4 py-3.5 hris-card hris-card-hover",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-[52px] shrink-0 items-center justify-center rounded-2xl",
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
      <HrisIcon
        name="arrow-right"
        className="size-5 shrink-0 text-muted-foreground transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary"
      />
    </Link>
  );
}
