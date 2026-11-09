import Link from "next/link";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

type QuickAccessTone =
  | "soft-blue"
  | "mint"
  | "lavender"
  | "peach"
  | "indigo"
  | "teal"
  | "pink";

const iconToneClasses: Record<QuickAccessTone, string> = {
  "soft-blue": "bg-surface-soft-blue text-primary",
  mint: "bg-surface-mint text-info",
  lavender: "bg-surface-lavender text-indigo",
  peach: "bg-surface-peach text-warning",
  indigo: "bg-surface-indigo text-primary",
  teal: "bg-surface-teal text-info",
  pink: "bg-surface-pink text-danger",
};

interface QuickAccessCardProps {
  href: string;
  icon: HrisIconName;
  title: string;
  description: string;
  tone: QuickAccessTone;
}

/**
 * Compact horizontal shortcut card for Quick Access.
 *
 * Target height 76–88px: pastel icon container on the left, module title and
 * short description in the middle, small chevron on the right. White surface
 * with a subtle border and soft hover elevation — no large full-color
 * backgrounds.
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
        "group flex w-full items-center gap-3 rounded-[20px] border border-border bg-card p-3 hris-card-hover",
        "md:h-[84px] min-h-[76px]"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex shrink-0 items-center justify-center rounded-[12px]",
          iconToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground tracking-tight">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">
          {description}
        </span>
      </div>
      <HrisIcon
        name="arrow-right"
        className="shrink-0 size-4 text-muted-foreground group-hover:text-primary transition-colors"
        aria-hidden="true"
      />
    </Link>
  );
}
