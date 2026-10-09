"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
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
  { key: "attendance", href: "/attendance", label: "Kehadiran", icon: "calendar-check" },
];

const RIGHT: NavEntry[] = [
  { key: "notifications", href: "/notifications", label: "Notifikasi", icon: "bell" },
  { key: "account", href: "/settings/account", label: "Saya", icon: "profile" },
];

function isEntryActive(pathname: string, entry: NavEntry): boolean {
  if (entry.href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  if (entry.href === "/attendance") {
    // The centre Presensi button owns the exact /attendance route; the
    // "Kehadiran" tab owns attendance sub-pages (e.g. a record detail).
    return pathname.startsWith("/attendance/");
  }
  return pathname === entry.href || pathname.startsWith(`${entry.href}/`);
}

function NavButton({ entry, active }: { entry: NavEntry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-2xl px-1 text-[10px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:outline-none",
        active ? "text-[#1677e8]" : "text-slate-400 hover:text-slate-600"
      )}
    >
      <HrisIcon name={entry.icon} className={active ? "size-5.5" : "size-5"} />
      <span className="truncate">{entry.label}</span>
    </Link>
  );
}

/**
 * Employee self-service bottom navigation (mobile / PWA).
 *
 * Beranda · Kehadiran · [Presensi] · Notifikasi · Saya — the centre action is
 * the elevated Presensi button. Fixed, safe-area aware and hidden on `lg+`
 * where the desktop sidebar takes over.
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

  return (
    <nav
      aria-label="Navigasi utama"
      className="emp-safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 px-2 pt-1.5 shadow-[0_-10px_34px_-16px_rgba(15,23,42,0.28)] backdrop-blur lg:hidden"
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
                className="emp-gradient -mt-7 flex size-16 flex-col items-center justify-center gap-0.5 self-center rounded-full border-4 border-white text-white opacity-50 shadow-[0_14px_30px_-10px_rgba(22,119,232,0.85)] ring-1 ring-cyan-200/80 transition-transform focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95"
              >
                <HrisIcon name="face" className="size-7" />
                <span className="text-[10px] font-semibold tracking-wide">ABSEN</span>
              </button>
              {absenNotice ? (
                <p
                  role="status"
                  className="absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-2xl bg-slate-900/95 px-4 py-2.5 text-left text-xs font-medium leading-relaxed text-white shadow-xl"
                >
                  {ABSEN_UNAVAILABLE_NOTICE}
                </p>
              ) : null}
            </>
          )}
        </div>

        {RIGHT.map((entry) => (
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
