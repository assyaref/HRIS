"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { useOptionalShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils/cn";

import { FloatingAttendanceButton } from "./floating-attendance-button";

/**
 * Shown when an account without `attendance.view` taps the unavailable ABSEN
 * action. The control stays non-navigating (the server route guard is the
 * authority) but must explain WHY attendance is off instead of silently
 * ignoring the tap.
 */
const ABSEN_UNAVAILABLE_NOTICE =
  "Presensi belum tersedia untuk akun Anda. Hubungi administrator atau HR untuk mengaktifkan izin presensi.";

interface NavEntry {
  key: string;
  href: string;
  label: string;
  icon: HrisIconName;
}

const LEFT: NavEntry[] = [
  { key: "home", href: "/dashboard", label: "Beranda", icon: "home" },
  { key: "attendance", href: "/attendance", label: "Absensi", icon: "calendar-check" },
];

const LEAVE: NavEntry = { key: "leave", href: "/leave", label: "Cuti", icon: "plane" };
const NOTIFICATIONS: NavEntry = {
  key: "notifications",
  href: "/notifications",
  label: "Notifikasi",
  icon: "bell",
};
const PROFILE: NavEntry = {
  key: "account",
  href: "/settings/account",
  label: "Profil",
  icon: "user",
};

function isEntryActive(pathname: string, entry: NavEntry): boolean {
  if (entry.href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  if (entry.href === "/attendance") {
    // The "Absensi" tab owns the attendance page (Riwayat / Rekap) and its
    // sub-pages (e.g. a record detail). The centre ABSEN button opens the
    // face-attendance sheet and never navigates.
    return pathname === "/attendance" || pathname.startsWith("/attendance/");
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function NavButton({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-[60px] flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
        active ? "text-primary" : "text-muted-foreground hover:text-foreground"
      )}
    >
      <HrisIcon name={entry.icon} className="size-[26px]" />
      <span className="truncate">{entry.label}</span>
    </Link>
  );
}

/**
 * Bottom navigation for every signed-in user on mobile / PWA (HRIS Lite v2).
 *
 * Beranda · Absensi · [ABSEN face] · Cuti · Profil — the centre action is the
 * raised round face button that opens the attendance sheet. "Cuti" falls back to "Notifikasi" for accounts
 * without the leave module. Fixed, safe-area aware and hidden on `lg+` where
 * the desktop sidebar takes over.
 */
export function EmployeeBottomNavigation({
  canAttendance = true,
  notificationCount = 0,
}: {
  canAttendance?: boolean;
  notificationCount?: number;
}) {
  const pathname = usePathname();
  const presensiActive = pathname === "/attendance";
  const [absenNotice, setAbsenNotice] = useState(false);
  const shell = useOptionalShell();
  const canLeave = shell ? shell.hrefs.includes("/leave") : true;
  const right: NavEntry[] = [canLeave ? LEAVE : NOTIFICATIONS, PROFILE];

  return (
    <nav
      aria-label="Navigasi utama"
      className="emp-safe-bottom fixed inset-x-0 bottom-0 z-40 rounded-t-[26px] border-t border-border/70 bg-card px-3 pt-1 shadow-[0_-12px_32px_-18px_rgb(30_64_175/0.35)] lg:hidden"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
        {LEFT.map((entry) => (
          <NavButton
            key={entry.key}
            entry={entry}
            active={isEntryActive(pathname, entry)}
          />
        ))}

        <div className="relative flex items-start justify-center">
          {canAttendance ? (
            <FloatingAttendanceButton href="/attendance" active={presensiActive} />
          ) : (
            <>
              <button
                type="button"
                aria-label="ABSEN tidak tersedia"
                aria-disabled="true"
                aria-expanded={absenNotice}
                title="Presensi tidak tersedia untuk akun Anda"
                onClick={() => setAbsenNotice((visible) => !visible)}
                className="hris-fab -mt-9 flex size-[68px] items-center justify-center self-center rounded-full text-white opacity-50 transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
              >
                <HrisIcon name="face" className="size-9" />
              </button>
              {absenNotice ? (
                <p
                  role="status"
                  className="absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-2xl bg-slate-900/95 px-4 py-2.5 text-left text-xs leading-relaxed font-medium text-white shadow-xl"
                >
                  {ABSEN_UNAVAILABLE_NOTICE}
                </p>
              ) : null}
            </>
          )}
        </div>

        {right.map((entry) => (
          <NavButton
            key={entry.key}
            entry={entry}
            active={isEntryActive(pathname, entry)}
          />
        ))}
      </div>

      {notificationCount > 0 ? (
        <span className="sr-only">{notificationCount} notifikasi belum dibaca</span>
      ) : null}
    </nav>
  );
}
