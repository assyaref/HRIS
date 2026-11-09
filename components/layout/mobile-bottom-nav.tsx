"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";
import type { NavSection } from "@/types/navigation";

/** Destinations exposed to management/administrative users on mobile. */
const preferredTitles = ["Dashboard", "Attendance", "Employees", "Payroll", "Payslip"];

const iconByTitle: Record<string, HrisIconName> = {
  Dashboard: "dashboard",
  Attendance: "attendance",
  Employees: "employees",
  Payroll: "payroll",
  Payslip: "payslip",
};

function isActivePath(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Management mobile bottom navigation — MD3 navigation bar.
 *
 * Five destinations drawn from the permission-filtered sections: Dashboard ·
 * Attendance · Employees · Payroll · Payslip. White bar, MD3 active
 * indicator pill behind the icon, primary label for the active route,
 * safe-area inset support, 56px touch targets, hidden on `lg+`.
 */
export function MobileBottomNav({
  sections,
}: {
  sections: NavSection[];
}) {
  const pathname = usePathname();

  const items = sections
    .flatMap((section) => section.items)
    .filter((item) => preferredTitles.includes(item.title))
    .sort(
      (a, b) =>
        preferredTitles.indexOf(a.title) - preferredTitles.indexOf(b.title),
    )
    .slice(0, 5);

  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Quick navigation"
      className="emp-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2.5 pt-1.5 pb-1 shadow-[0_-8px_24px_-16px_rgb(15_23_42/0.18)] backdrop-blur-md lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {items.map((item) => {
          const active = isActivePath(pathname, item.href);
          const iconName: HrisIconName = item.icon ?? iconByTitle[item.title] ?? "dashboard";

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "group flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                active ? "font-semibold text-primary" : "font-medium text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className={cn(
                  "flex h-7 w-12 items-center justify-center rounded-full transition-colors",
                  active ? "bg-surface-primary" : "group-hover:bg-muted"
                )}
              >
                <HrisIcon name={iconName} className="size-5 shrink-0" />
              </span>
              <span className="max-w-full truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
