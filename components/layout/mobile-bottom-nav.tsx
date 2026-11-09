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
 * Management mobile bottom navigation — MD3 Soft Blue.
 *
 * Five destinations drawn from the permission-filtered sections: Dashboard ·
 * Attendance · Employees · Payroll · Payslip. Fixed bottom position · white
 * surface · soft rounded active indicator · pastel blue active icon · muted
 * inactive icons · safe-area inset support · minimum 44px touch targets ·
 * hidden on `lg+` where the desktop shell takes over.
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
      className="emp-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2.5 pb-1 pt-1.5 shadow-[0_-10px_34px_-16px_rgb(25,28,36,0.10)] backdrop-blur-md lg:hidden"
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
                "flex min-h-14 flex-col items-center justify-center gap-1.5 rounded-2xl px-1 text-[10px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                active
                  ? "bg-surface-primary text-primary"
                  : "text-muted-foreground hover:text-primary hover:bg-accent/40"
              )}
            >
              <HrisIcon
                name={iconName}
                className={cn(
                  "size-5 shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="truncate">{item.title}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
