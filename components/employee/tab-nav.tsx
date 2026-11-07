import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export interface TabNavItem {
  key: string;
  label: string;
  href: string;
  active: boolean;
}

/**
 * Link-based tab bar. State lives in the URL (server-rendered active tab) so
 * heavy client panels are only mounted for the selected tab. Horizontally
 * scrollable on small screens. Fully theme-adaptive.
 */
export function TabNav({ items }: { items: TabNavItem[] }) {
  return (
    <div
      role="tablist"
      aria-label="Bagian"
      className="no-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          className={cn(
            "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            item.active
              ? "bg-primary text-primary-foreground shadow-sm"
              : "bg-card text-muted-foreground border border-border ring-1 ring-inset hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
