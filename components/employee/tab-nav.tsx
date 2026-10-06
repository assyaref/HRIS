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
 * scrollable on small screens.
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
            "inline-flex min-h-10 shrink-0 items-center rounded-full px-4 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:outline-none",
            item.active
              ? "bg-[#1677e8] text-white shadow-[0_10px_22px_-12px_rgba(22,119,232,0.9)]"
              : "bg-white text-[#64748b] ring-1 ring-slate-200 hover:text-[#172554]"
          )}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
