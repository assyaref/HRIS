"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * Client tab strip for the employee detail page.
 *
 * Selection is carried in the URL (`?tab=…`) so a tab is shareable,
 * bookmarkable and survives refreshes; the SERVER decides which tabs exist
 * and what to render (this component only moves a query parameter).
 */
export interface EmployeeTab {
  key: string;
  label: string;
  visible: boolean;
}

export function EmployeeTabs({
  tabs,
  active,
}: {
  tabs: EmployeeTab[];
  active: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const visible = tabs.filter((tab) => tab.visible);

  function select(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", key);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="no-scrollbar flex overflow-x-auto">
      <ul className="flex min-w-max gap-1 rounded-xl bg-muted p-1 ring-1 ring-border/60 ring-inset" role="tablist">
        {visible.map((tab) => {
          const selected = tab.key === active;
          return (
            <li key={tab.key}>
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => select(tab.key)}
                className={
                  selected
                    ? "rounded-[10px] bg-card px-4 py-2 text-sm font-semibold text-primary shadow-[var(--shadow-card)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    : "rounded-[10px] px-4 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                }
              >
                {tab.label}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
