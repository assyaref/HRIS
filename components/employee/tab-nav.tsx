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
      className="no-scrollbar -mx-1 flex gap-6 overflow-x-auto border-b border-border px-1"
    >
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          role="tab"
          aria-selected={item.active}
          className={cn(
            // Minimal UI tabs: text with a 2px indicator under the active tab.
            "relative inline-flex min-h-12 shrink-0 items-center text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            "after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:transition-colors",
            item.active
              ? "text-foreground after:bg-foreground"
              : "text-muted-foreground after:bg-transparent hover:text-foreground"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
