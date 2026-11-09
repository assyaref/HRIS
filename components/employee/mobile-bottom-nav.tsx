"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

interface NavDestination {
  key: string;
  href: string;
  label: string;
  icon: Parameters<typeof HrisIcon>[0]["name"];
}

const DESTINATIONS: NavDestination[] = [
  { key: "home", href: "/dashboard", label: "Beranda", icon: "home" },
  { key: "attendance", href: "/attendance", label: "Absensi", icon: "calendar-check" },
  { key: "scan", href: "/face-id", label: "Scan", icon: "scan" },
  { key: "leave", href: "/leave", label: "Cuti", icon: "leave" },
  { key: "profile", href: "/settings/account", label: "Profil", icon: "profile" },
];

interface EmployeeMobileBottomNavProps {
  canAttendance?: boolean;
  notificationCount?: number;
}

/**
 * Employee fixed bottom navigation (HRIS Lite Enterprise).
 *
 * Five destinations: Beranda · Absensi · Scan / Face ID · Cuti · Profil.
 * Fixed bottom position · active blue icon and label · consistent inactive
 * states · safe-area inset support · minimum 44px touch targets · content
 * must not be hidden behind navigation. Hidden on `lg+` where the desktop
 * shell takes over.
 */
export function EmployeeMobileBottomNav({
  canAttendance = true,
  notificationCount = 0,
}: EmployeeMobileBottomNavProps = {}) {
  const pathname = usePathname();

  function isActive(href: string): boolean {
    if (href === "/dashboard") {
      return pathname === "/dashboard" || pathname === "/";
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  const destinations = canAttendance
    ? DESTINATIONS
    : DESTINATIONS.filter((d) => d.key !== "attendance" && d.key !== "scan");

  return (
    <nav
      aria-label="Navigasi utama"
      className="emp-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 px-2.5 pb-1 pt-1.5 shadow-[0_-10px_34px_-16px_rgba(16,42,86,0.12)] backdrop-blur-lg lg:hidden"
    >
      <div className="mx-auto grid max-w-md grid-cols-5 items-end">
        {destinations.map((destination) => {
          const active = isActive(destination.href);
          const showBadge =
            destination.key === "attendance" && notificationCount > 0;

          return (
            <Link
              key={destination.key}
              href={destination.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              <HrisIcon
                name={destination.icon}
                className={cn(
                  "size-5 shrink-0",
                  active ? "text-primary" : "text-muted-foreground"
                )}
              />
              <span className="truncate">{destination.label}</span>
              {showBadge ? (
                <span
                  className="absolute -top-1 -right-1 flex min-w-[1.25rem] items-center justify-center rounded-full bg-primary px-1 py-0.5 text-[10px] font-semibold text-primary-foreground ring-1 ring-background"
                >
                  {notificationCount > 9 ? "9+" : notificationCount}
                </span>
              ) : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
