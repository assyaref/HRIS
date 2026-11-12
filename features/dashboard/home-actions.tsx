"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { useShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/types/navigation";

/**
 * Interactive pieces of the employee home (reference mobile layout):
 * the "Absen Sekarang" card and the full "Menu" grid.
 * Sizes scale with the home column (`@container` on the page), not with
 * viewport breakpoints, so the layout stays the same on every phone width.
 */

const QUICK_LABEL_CLASS =
  "line-clamp-2 w-full text-[clamp(9.5px,2.6cqw,12.5px)] leading-tight font-semibold tracking-[-0.02em] text-balance text-foreground";

/**
 * Per-page presentation for the Beranda menu grid: a short label and a
 * tinted icon chip. Unknown hrefs fall back to the navigation title/icon.
 */
const HOME_MENU_STYLE: Record<string, { label?: string; icon?: HrisIconName; chip: string }> = {
  "/attendance": { label: "Absensi", chip: "bg-[#E0EEFF] text-[#1D6FE0] dark:bg-[#16264A] dark:text-[#93C5FD]" },
  "/face-id": { label: "Face ID", chip: "bg-[#DDF5EE] text-[#0D9488] dark:bg-[#112E28] dark:text-[#5EEAD4]" },
  "/leave": { label: "Cuti", chip: "bg-[#EEE8FF] text-[#7C3AED] dark:bg-[#251E45] dark:text-[#C4B5FD]" },
  "/permission": { label: "Izin", chip: "bg-[#FFF1E0] text-[#EA7A0C] dark:bg-[#3A2A10] dark:text-[#FCD34D]" },
  "/payslip": { label: "Slip Gaji", icon: "wallet", chip: "bg-[#E3F6E8] text-[#16A34A] dark:bg-[#16301C] dark:text-[#86EFAC]" },
  // Soft hyphen: breaks as "Pengu-muman" only when the tile is too narrow.
  "/announcements": { label: "Pengu\u00ADmuman", chip: "bg-[#FFE8EC] text-[#E11D48] dark:bg-[#3A1620] dark:text-[#FDA4AF]" },
  "/notifications": { label: "Notifikasi", chip: "bg-[#FFF6D6] text-[#CA8A04] dark:bg-[#33290C] dark:text-[#FDE68A]" },
  "/settings/account": { label: "Profil Saya", chip: "bg-[#E8ECF5] text-[#334E85] dark:bg-[#1E2638] dark:text-[#B4C3E3]" },
};
const DEFAULT_CHIP = "bg-[#E0EEFF] text-[#1D6FE0] dark:bg-[#16264A] dark:text-[#93C5FD]";

/**
 * Beranda "Menu": every page the employee may open, as a 4-column grid.
 * Self-service accounts have no menu in the drawer, so this is the one place
 * that lists them. Items come from the shell's server-filtered navigation
 * (the route guards stay the authority); Beranda itself is left out.
 */
export function HomeMenuGrid({ unreadAnnouncements }: { unreadAnnouncements: number }) {
  const { sections, notificationCount } = useShell();
  const flatten = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => (item.children ? flatten(item.children) : [item]));
  const seen = new Set<string>();
  const items = sections
    .flatMap((section) => flatten(section.items))
    .filter((item) => {
      if (item.href === "/dashboard" || item.href.startsWith("#") || seen.has(item.href)) {
        return false;
      }
      seen.add(item.href);
      return true;
    });

  if (items.length === 0) return null;

  return (
    <nav aria-label="Menu" className="grid grid-cols-4 gap-2">
      {items.map((item) => {
        const style = HOME_MENU_STYLE[item.href];
        const count =
          item.href === "/notifications"
            ? notificationCount
            : item.href === "/announcements"
              ? unreadAnnouncements
              : 0;
        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex min-h-[86px] flex-col items-center justify-start gap-1.5 rounded-2xl border border-[var(--card-border)] bg-card px-0.5 pt-3 pb-2 text-center hris-card transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]"
          >
            <span
              className={cn(
                "relative flex size-[clamp(38px,10.5cqw,46px)] items-center justify-center rounded-[14px]",
                style?.chip ?? DEFAULT_CHIP
              )}
            >
              <HrisIcon name={style?.icon ?? item.icon ?? "dashboard"} className="size-[58%]" />
              {count > 0 ? (
                <span className="absolute -top-1.5 -right-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#EF2B3B] px-1 text-[10.5px] font-bold text-white ring-2 ring-card">
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </span>
            <span className={QUICK_LABEL_CLASS}>{style?.label ?? item.title}</span>
            {count > 0 ? <span className="sr-only">, {count} belum dibaca</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * "Absen Sekarang": opens the face-attendance sheet (same flow as the centre
 * ABSEN button). When attendance is not actionable today it becomes a plain
 * card with the reason and a link to the history.
 */
export function AbsenNowCard({
  enabled,
  subtitle,
}: {
  enabled: boolean;
  subtitle: string;
}) {
  const { openAttendanceSheet, attendanceSheetOpen } = useShell();

  if (!enabled) {
    return (
      <div className="flex items-center gap-3 rounded-[18px] border border-[var(--card-border)] bg-card px-3.5 py-3 hris-card">
        <span className="hris-chip-blue flex size-11 shrink-0 items-center justify-center rounded-xl">
          <HrisIcon name="face" className="size-7" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] leading-tight font-bold text-foreground">Absen Sekarang</span>
          <span className="block truncate text-[12.5px] text-muted-foreground">{subtitle}</span>
        </span>
        <Link
          href="/attendance"
          className="shrink-0 text-[13px] font-semibold text-primary hover:underline"
        >
          Riwayat
        </Link>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={openAttendanceSheet}
      aria-haspopup="dialog"
      aria-expanded={attendanceSheetOpen}
      className="hris-band group flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left shadow-[0_14px_28px_-16px_rgb(30_94_235/0.9)] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.995]"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25">
        <HrisIcon name="face" className="size-7" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[17px] leading-tight font-bold">Absen Sekarang</span>
        <span className="mt-0.5 block truncate text-[12.5px] leading-snug text-white/90">{subtitle}</span>
      </span>
      <span
        aria-hidden="true"
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform group-hover:translate-x-0.5"
      >
        <HrisIcon name="arrow-right" className="size-5" />
      </span>
    </button>
  );
}

/** One of the four "today" tiles (Hadir Hari Ini, Jam Pulang, Lokasi, Status). */
export function TodayTile({
  icon,
  chip,
  label,
  children,
}: {
  icon: HrisIconName;
  /** Tinted background + icon colour of the round chip. */
  chip: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-2xl border border-[var(--card-border)] bg-card px-2.5 py-2.5 hris-card">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", chip)}>
        <HrisIcon name={icon} className="size-5" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-foreground/85">{label}</p>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
  );
}
