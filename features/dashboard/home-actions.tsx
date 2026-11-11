"use client";

import Link from "next/link";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { useShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils/cn";

/**
 * Client leaves of the employee home that talk to the shell: the big
 * "Absen Sekarang" card opens the face-attendance sheet, and the quick menu's
 * "Lihat Semua" / "Lainnya" open the navigation drawer. Everything they show
 * is passed in from the server-rendered dashboard.
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
      <div className="flex items-center gap-4 rounded-[22px] border border-[var(--card-border)] bg-card px-4 py-4 hris-card">
        <span className="hris-chip-blue flex size-16 shrink-0 items-center justify-center rounded-2xl">
          <HrisIcon name="face" className="size-9" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[20px] leading-tight font-bold text-foreground">Absen Sekarang</span>
          <span className="block text-sm text-muted-foreground">{subtitle}</span>
        </span>
        <Link
          href="/attendance"
          className="shrink-0 text-sm font-semibold text-primary hover:underline"
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
      className="hris-band group flex w-full items-center gap-4 rounded-[22px] px-4 py-4 text-left shadow-[0_18px_34px_-18px_rgb(30_94_235/0.9)] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.995]"
    >
      <span className="flex size-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 ring-1 ring-white/25">
        <HrisIcon name="face" className="size-10" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[22px] leading-tight font-bold">Absen Sekarang</span>
        <span className="mt-0.5 line-clamp-2 block text-[14px] leading-snug text-white/90">{subtitle}</span>
      </span>
      <span
        aria-hidden="true"
        className="flex size-12 shrink-0 items-center justify-center rounded-full bg-white text-primary shadow-sm transition-transform group-hover:translate-x-0.5"
      >
        <HrisIcon name="arrow-right" className="size-6" />
      </span>
    </button>
  );
}

export const QUICK_TILE_CLASS =
  "hris-card flex min-h-[96px] flex-col items-center justify-center gap-2 rounded-[18px] px-1 py-3 text-center transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function QuickMenuTile({
  href,
  icon,
  label,
  badge,
}: {
  href: string;
  icon: HrisIconName;
  label: string;
  badge?: number | null;
}) {
  return (
    <Link href={href} className={QUICK_TILE_CLASS}>
      <span className="relative text-primary">
        <HrisIcon name={icon} className="size-8" />
        {badge ? (
          <span className="absolute -top-2 -right-3 flex min-w-5 items-center justify-center rounded-full bg-[#EF4444] px-1 py-0.5 text-[10px] font-bold text-white ring-2 ring-card">
            {badge > 99 ? "99+" : badge}
          </span>
        ) : null}
      </span>
      <span className="text-[13px] leading-tight font-semibold text-foreground">{label}</span>
    </Link>
  );
}

/** "Lainnya": opens the full navigation drawer (every module one tap away). */
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
      <span className="text-slate-500 dark:text-slate-300">
        <HrisIcon name="grid" className="size-8" />
      </span>
      <span className="text-[13px] leading-tight font-semibold text-foreground">Lainnya</span>
    </button>
  );
}

export function QuickMenuSeeAll({ className }: { className?: string }) {
  const { setDrawerOpen } = useShell();
  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      className={cn(
        "inline-flex items-center gap-1 text-[15px] font-semibold text-primary hover:text-primary/85 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        className
      )}
    >
      Lihat Semua
      <HrisIcon name="chevron-right" className="size-5" />
    </button>
  );
}
