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
    <div className="flex overflow-x-auto border-b border-border">
      <ul className="flex min-w-max gap-1" role="tablist">
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
                    ? "border-b-2 border-primary px-4 py-2 text-sm font-medium text-primary"
                    : "border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
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
