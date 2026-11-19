"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { AdminTopBar } from "./admin-top-bar";
import { BrandMark } from "./brand";
import { HrisIcon } from "./icons";
import { useShell } from "./shell-context";
import { Avatar } from "./user-menu";

/**
 * Header of every authenticated page.
 *
 * Management shell: `AdminTopBar` (floating white cards). Self-service frame
 * (soft pastel, v9): a floating white top bar (brand, company, notifications,
 * profile), then the page title on the canvas, or, on Beranda, a pastel
 * greeting panel that the clock / weather / prayer cards overlap.
 */
export function HeroBand() {
  const { employeeFrame } = useShell();
  const pathname = usePathname();
  const isHome = pathname === "/dashboard" || pathname === "/";

  if (!employeeFrame) return <AdminTopBar pathname={pathname} isHome={isHome} />;

  // Self-service pages show their title here; the page keeps its own h1 for
  // screen readers only (`.emp-page-title`, globals.css).
  const bandTitle = employeeBandTitle(pathname);

  return (
    <header className="relative px-3.5 pt-3">
      <EmployeeTopBar />
      {isHome ? (
        <Greeting />
      ) : bandTitle ? (
        <div className="px-1 pt-5 pb-2">
          <p className="text-[clamp(24px,7vw,28px)] leading-tight font-bold tracking-tight text-[#1B1F3B] dark:text-foreground">
            {bandTitle.title}
          </p>
          <p className="mt-1 text-[14px] leading-snug text-muted-foreground">
            {bandTitle.subtitle}
          </p>
        </div>
      ) : (
        <div className="h-3" />
      )}
    </header>
  );
}

/**
 * Title + subtitle for every self-service page (matched by route prefix;
 * detail pages inherit their list's title).
 */
const EMPLOYEE_BAND_TITLES: Array<[string, { title: string; subtitle: string }]> = [
  ["/settings/account", { title: "Profil Saya", subtitle: "Kelola informasi akun dan data kepegawaian Anda." }],
  ["/attendance", { title: "Absensi", subtitle: "Riwayat, rekap, dan presensi kehadiran Anda." }],
  ["/face-id", { title: "Face ID", subtitle: "Data wajah untuk verifikasi absensi Anda." }],
  ["/leave", { title: "Cuti", subtitle: "Ajukan cuti, pantau saldo dan riwayatnya." }],
  ["/permission", { title: "Izin Kegiatan", subtitle: "Ajukan dan pantau izin kegiatan Anda." }],
  ["/overtime", { title: "Lembur", subtitle: "Ajukan dan pantau lembur (SPKL) Anda." }],
  ["/time/calendar", { title: "Kalender Libur", subtitle: "Hari libur nasional, cuti bersama, dan libur perusahaan." }],
  ["/team-approvals", { title: "Persetujuan Tim", subtitle: "Pengajuan anggota tim yang menunggu keputusan Anda." }],
  ["/agenda", { title: "Agenda", subtitle: "Rapat, training, dan acara perusahaan." }],
  ["/timesheet", { title: "Timesheet", subtitle: "Catat jam kerja per proyek dan ajukan tiap minggu." }],
  ["/helpdesk", { title: "Tanya Admin", subtitle: "Pertanyaan dan kendala Anda ke HR." }],
  ["/payslip", { title: "Slip Gaji Saya", subtitle: "Lihat dan unduh slip gaji Anda." }],
  ["/announcements", { title: "Pengumuman", subtitle: "Informasi resmi dari perusahaan." }],
  ["/notifications", { title: "Notifikasi", subtitle: "Pemberitahuan terbaru untuk Anda." }],
];

function employeeBandTitle(pathname: string) {
  return EMPLOYEE_BAND_TITLES.find(
    ([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )?.[1];
}


/**
 * Self-service top bar on a floating white card: HRIS mark + wordmark, the
 * company (logo or name) on a soft pill, notifications and the profile photo.
 * Fixed sizes so it looks the same on every phone from 360px up and in the
 * desktop frame; below 360px only the company pill gives up width.
 */
function EmployeeTopBar() {
  const { profile, notificationCount } = useShell();
  return (
    <div className="hris-top-card relative z-10 flex h-16 items-center gap-1.5 px-2.5">
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-2"
        aria-label="HRIS — Beranda"
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white ring-1 ring-border">
          <BrandMark size={33} priority />
        </span>
        <span className="leading-none">
          <span className="block text-[19px] font-extrabold tracking-tight text-[var(--brand-navy)] dark:text-white">
            HRIS
          </span>
          <span className="mt-0.5 block w-[4.6rem] text-[8.5px] leading-[1.15] font-medium text-muted-foreground">
            Human Resource Information System
          </span>
        </span>
      </Link>

      {profile.organizationName ? (
        <span
          className="ml-1 flex h-9 w-[5.25rem] min-w-[3.5rem] shrink items-center justify-center rounded-full border border-border bg-muted px-2.5"
          title={profile.organizationName}
        >
          {profile.organizationLogoUrl ? (
            // Authenticated image route; next/image cannot optimise it.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={profile.organizationLogoUrl}
              alt={profile.organizationName}
              className="max-h-[22px] w-auto max-w-full object-contain"
            />
          ) : (
            <span className="truncate text-[12px] font-bold tracking-tight text-foreground">
              {profile.organizationName}
            </span>
          )}
        </span>
      ) : null}

      <div className="min-w-1 flex-1" />

      <Link
        href="/notifications"
        aria-label={
          notificationCount > 0
            ? `Notifikasi, ${notificationCount} belum dibaca`
            : "Notifikasi"
        }
        className="relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/75 transition-colors hover:bg-surface-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <HrisIcon name="bell" className="size-[20px]" />
        {notificationCount > 0 ? (
          <span className="absolute top-1.5 right-2 size-2.5 rounded-full bg-[#FF3B47] ring-2 ring-card" />
        ) : null}
      </Link>
      <Link href="/settings/account" aria-label="Profil saya" className="shrink-0">
        <Avatar profile={profile} size={40} />
      </Link>
    </div>
  );
}

/** Beranda greeting on the pastel panel; the widget cards overlap its foot. */
function Greeting() {
  const { profile } = useShell();
  const title = profile.position?.trim() || profile.roleLabel;

  return (
    <div className="hris-overview mt-3 px-5 pt-5 pb-14">
      <p className="text-[15px] font-medium text-foreground/70">
        {profile.greeting},
      </p>
      <p className="mt-0.5 truncate text-[clamp(22px,6.6vw,27px)] leading-tight font-bold tracking-tight text-[#1B1F3B] dark:text-foreground">
        {profile.displayName}
      </p>
      {title ? (
        <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-white/70 px-3 py-1 text-[13px] font-medium text-foreground/80 dark:bg-white/10">
          <HrisIcon name="briefcase" className="size-4 shrink-0 text-primary" />
          <span className="min-w-0 truncate">{title}</span>
        </p>
      ) : null}
    </div>
  );
}
