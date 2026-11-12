"use client";

import Link from "next/link";

import { HrisIcon, type HrisIconName } from "@/components/layout/icons";
import { useShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils/cn";

/**
 * Menu tiles of the employee home (reference 3×2 grid): a soft pastel card
 * per module with a coloured icon and a bold two-line label. "Lainnya" opens
 * the navigation drawer, so every module stays one tap away.
 */
export type HomeMenuTone = "blue" | "violet" | "orange" | "teal" | "green" | "purple" | "slate";

const TONE: Record<HomeMenuTone, { tile: string; icon: string }> = {
  blue: {
    tile: "from-[#EAF2FF] to-[#D9E7FF] dark:from-[#16264A] dark:to-[#122040]",
    icon: "text-[#1D5FE0] dark:text-[#8CB6FF]",
  },
  violet: {
    tile: "from-[#F4EEFF] to-[#ECE6FF] dark:from-[#251E45] dark:to-[#1F1A3B]",
    icon: "text-[#8B3FE8] dark:text-[#C4B5FD]",
  },
  orange: {
    tile: "from-[#FFF3EC] to-[#FFE5E0] dark:from-[#3A2216] dark:to-[#331C17]",
    icon: "text-[#F2691B] dark:text-[#FDBA74]",
  },
  teal: {
    tile: "from-[#E9FBF5] to-[#DDF5EE] dark:from-[#112E28] dark:to-[#0F2823]",
    icon: "text-[#0EA371] dark:text-[#5EEAD4]",
  },
  green: {
    tile: "from-[#EEFAEF] to-[#E2F5E6] dark:from-[#16301C] dark:to-[#122A18]",
    icon: "text-[#2FA84F] dark:text-[#86EFAC]",
  },
  purple: {
    tile: "from-[#F5F0FF] to-[#ECE3FF] dark:from-[#271E48] dark:to-[#20193D]",
    icon: "text-[#7C4DEB] dark:text-[#C4B5FD]",
  },
  slate: {
    tile: "from-[#F2F5FA] to-[#E6ECF5] dark:from-[#1A2233] dark:to-[#161D2C]",
    icon: "text-slate-500 dark:text-slate-300",
  },
};

const TILE_CLASS =
  "relative flex min-h-[112px] flex-col items-center justify-center gap-2 rounded-[20px] border border-white/80 bg-gradient-to-b px-1.5 py-3 text-center shadow-[0_10px_24px_-14px_rgb(30_64_175/0.45)] transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-[0.98] dark:border-white/5";

const LABEL_CLASS =
  "line-clamp-2 text-[14px] leading-[1.15] font-bold tracking-tight text-foreground";

export function HomeMenuTile({
  href,
  icon,
  label,
  tone,
  dot,
  dotLabel,
}: {
  href: string;
  icon: HrisIconName;
  label: string;
  tone: HomeMenuTone;
  /** Red dot in the corner (e.g. unread announcements). */
  dot?: boolean;
  dotLabel?: string;
}) {
  const colors = TONE[tone];
  return (
    <Link href={href} className={cn(TILE_CLASS, colors.tile)}>
      {dot ? (
        <span
          aria-hidden="true"
          className="absolute top-2.5 right-2.5 size-3 rounded-full bg-[#EF2B3B] ring-2 ring-white dark:ring-card"
        />
      ) : null}
      <HrisIcon name={icon} className={cn("size-9", colors.icon)} />
      <span className={LABEL_CLASS}>{label}</span>
      {dot && dotLabel ? <span className="sr-only">, {dotLabel}</span> : null}
    </Link>
  );
}

export function HomeMenuMoreTile() {
  const { setDrawerOpen, drawerOpen } = useShell();
  const colors = TONE.orange;
  return (
    <button
      type="button"
      onClick={() => setDrawerOpen(true)}
      aria-haspopup="dialog"
      aria-expanded={drawerOpen}
      className={cn(TILE_CLASS, colors.tile)}
    >
      <HrisIcon name="grid" className={cn("size-9", colors.icon)} />
      <span className={LABEL_CLASS}>Lainnya</span>
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
