"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { useShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils/cn";

/**
 * Interactive pieces of the employee home (reference mobile layout):
 * the "Absen Sekarang" card and the one-row "Menu Cepat" (quick menu).
 * Sizes scale with the home column (`@container` on the page), not with
 * viewport breakpoints, so the layout stays the same on every phone width.
 */

const QUICK_TILE_CLASS =
  "relative flex min-h-[74px] flex-col items-center justify-center gap-1.5 rounded-2xl border border-[var(--card-border)] bg-card px-1 py-2.5 text-center hris-card transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.97]";

const QUICK_LABEL_CLASS =
  "w-full truncate text-[clamp(10.5px,2.7cqw,12.5px)] leading-tight font-semibold text-foreground";

export function QuickMenuTile({
  href,
  icon,
  label,
  dot,
  dotLabel,
}: {
  href: string;
  icon: HrisIconName;
  label: string;
  /** Red dot in the corner (e.g. unread announcements). */
  dot?: boolean;
  dotLabel?: string;
}) {
  return (
    <Link href={href} className={QUICK_TILE_CLASS}>
      {dot ? (
        <span
          aria-hidden="true"
          className="absolute top-1.5 right-1.5 size-2.5 rounded-full bg-[#EF2B3B] ring-2 ring-card"
        />
      ) : null}
      <HrisIcon name={icon} className="size-7 text-primary" />
      <span className={QUICK_LABEL_CLASS}>{label}</span>
      {dot && dotLabel ? <span className="sr-only">, {dotLabel}</span> : null}
    </Link>
  );
}

/** "Lainnya" tile — opens the navigation drawer with every module. */
export function QuickMenuMoreTile() {
  const { setDrawerOpen, drawerOpen } = useShell();
  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={drawerOpen}
      className={QUICK_TILE_CLASS}
    >
      <HrisIcon name="grid" className="size-7 text-primary" />
      <span className={QUICK_LABEL_CLASS}>Lainnya</span>
    </button>
  );
}

/** "Lihat Semua" link in the Menu Cepat header — same drawer as "Lainnya". */
export function QuickMenuSeeAll() {
  const { setDrawerOpen } = useShell();
  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-haspopup="dialog"
      className="inline-flex items-center gap-0.5 rounded-lg text-[13px] font-semibold text-primary hover:text-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      Lihat Semua
      <HrisIcon name="chevron-right" className="size-4" />
    </button>
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

/** Today's attendance state for the status tiles. */
export type TodayState =
  | "NOT_CHECKED_IN"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "ON_LEAVE"
  | "WEEKEND"
  | "REJECTED"
  | "UNAVAILABLE";

export const TODAY_STATUS: Record<TodayState, { label: string; pill: string }> = {
  NOT_CHECKED_IN: {
    label: "Belum Absen",
    pill: "bg-[#FFE7D6] text-[#C2410C] dark:bg-[#3A2216] dark:text-[#FDBA74]",
  },
  CHECKED_IN: {
    label: "Sudah Masuk",
    pill: "bg-[#DBEAFE] text-[#1D4ED8] dark:bg-[#16264A] dark:text-[#93C5FD]",
  },
  CHECKED_OUT: {
    label: "Selesai",
    pill: "bg-[#DCFCE7] text-[#15803D] dark:bg-[#16301C] dark:text-[#86EFAC]",
  },
  ON_LEAVE: {
    label: "Cuti",
    pill: "bg-[#EDE9FE] text-[#6D28D9] dark:bg-[#251E45] dark:text-[#C4B5FD]",
  },
  WEEKEND: {
    label: "Libur",
    pill: "bg-[#E2E8F0] text-[#475569] dark:bg-[#1A2233] dark:text-[#CBD5E1]",
  },
  REJECTED: {
    label: "Ditolak",
    pill: "bg-[#FEE2E2] text-[#B91C1C] dark:bg-[#3A1616] dark:text-[#FCA5A5]",
  },
  UNAVAILABLE: {
    label: "Tidak Aktif",
    pill: "bg-[#E2E8F0] text-[#475569] dark:bg-[#1A2233] dark:text-[#CBD5E1]",
  },
};

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
    <div className="flex min-w-0 items-center gap-2.5 rounded-2xl border border-[var(--card-border)] bg-card px-3 py-2.5 hris-card">
      <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl", chip)}>
        <HrisIcon name={icon} className="size-[22px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-semibold text-foreground/85">{label}</p>
        <div className="mt-0.5 min-w-0">{children}</div>
      </div>
    </div>
  );
}
