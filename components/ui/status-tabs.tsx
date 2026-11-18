import Link from "next/link";

import { cn } from "@/lib/utils/cn";

export interface StatusTab {
  /** Query value; "" = all. */
  value: string;
  label: string;
  count?: number;
  /** Dot colour for the tab (any CSS colour). */
  tone?: string;
}

/**
 * Link-based status tabs with counts ("Semua 12 · Menunggu 3 …"). Server
 * rendered: each tab is a URL, so filters stay shareable and back-button
 * friendly. `buildHref` receives the tab value.
 */
export function StatusTabs({
  tabs,
  active,
  buildHref,
  label = "Filter status",
}: {
  tabs: StatusTab[];
  active: string;
  buildHref: (value: string) => string;
  label?: string;
}) {
  return (
    <nav aria-label={label} className="no-scrollbar -mx-1 overflow-x-auto px-1">
      <ul className="flex w-max gap-2">
        {tabs.map((tab, index) => {
          const selected = tab.value === active;
          return (
            // Position-based key: "" (all) may coexist with a real "all" value.
            <li key={`${index}:${tab.value}`}>
              <Link
                href={buildHref(tab.value)}
                aria-current={selected ? "page" : undefined}
                className={cn(
                  "inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  selected
                    ? "border-primary bg-primary text-primary-foreground shadow-[var(--shadow-primary)]"
                    : "border-[var(--card-border)] bg-card text-foreground/80 hover:border-primary/40 hover:text-primary"
                )}
              >
                {tab.tone ? (
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: selected ? "currentColor" : tab.tone }}
                  />
                ) : null}
                {tab.label}
                {tab.count !== undefined ? (
                  <span
                    className={cn(
                      "min-w-6 rounded-full px-1.5 text-center text-[11px] tabular-nums",
                      selected ? "bg-white/25" : "bg-muted text-muted-foreground"
                    )}
                  >
                    {tab.count}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
