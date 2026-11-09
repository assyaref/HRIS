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
  mint: "bg-surface-mint text-success",
  lavender: "bg-surface-lavender text-violet-600 dark:text-violet-300",
  peach: "bg-surface-peach text-orange-600 dark:text-orange-300",
  indigo: "bg-surface-indigo text-indigo-600 dark:text-indigo-300",
  teal: "bg-surface-teal text-teal-700 dark:text-teal-300",
  pink: "bg-surface-pink text-pink-600 dark:text-pink-300",
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
 * Tinted icon tile on the left, module title and short description in the
 * middle, chevron on the right. White surface, hairline border, soft hover
 * elevation and primary-tinted chevron on hover.
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
        "group flex min-h-[72px] w-full items-center gap-3.5 rounded-2xl border border-[var(--card-border)] bg-card p-3.5 hris-card hris-card-hover",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-11 shrink-0 items-center justify-center rounded-xl",
          iconToneClasses[tone]
        )}
      >
        <HrisIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold tracking-tight text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {description}
        </span>
      </div>
      <HrisIcon
        name="arrow-right"
        className="size-4 shrink-0 text-muted-foreground/70 transition-[color,transform] group-hover:translate-x-0.5 group-hover:text-primary"
        aria-hidden="true"
      />
    </Link>
  );
}
