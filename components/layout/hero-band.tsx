"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

import { BrandMark } from "./brand";
import { AdminTopBar } from "./admin-top-bar";
import { HrisIcon } from "./icons";
import { OrganizationIdentity } from "./organization-switcher";
import { useShell } from "./shell-context";
import { Avatar } from "./user-menu";

/**
 * The blue band at the top of every authenticated page.
 *
 * Holds the top bar (menu, brand, organization logo, notifications, account)
 * and — on Beranda — the greeting hero. Other pages get a short band so the
 * whole app keeps the same header; page titles live in the page itself. The band closes with a soft wave into the
 * page background; on Beranda the clock / weather / prayer-schedule cards
 * follow directly below it.
 */
export function HeroBand() {
  const { employeeFrame } = useShell();
  const pathname = usePathname();
  const isHome = pathname === "/dashboard" || pathname === "/";

  // Management shell: light floating top bar instead of the blue band.
  if (!employeeFrame) return <AdminTopBar pathname={pathname} isHome={isHome} />;

  // Self-service pages that carry their title inside the band (reference
  // mobile layout); the page then renders its title only for screen readers.
  const bandTitle = employeeFrame ? employeeBandTitle(pathname) : undefined;

  return (
    <>
      <div className="hris-band hris-shell-band relative isolate overflow-hidden">
        <EmployeeTopBar />
        {isHome ? (
          <Greeting employeeFrame={employeeFrame} />
        ) : bandTitle ? (
          <div className="relative px-4 pt-1 pb-12">
            <p className="text-[clamp(24px,7vw,30px)] leading-tight font-extrabold tracking-tight text-white">
              {bandTitle.title}
            </p>
            <p className="mt-1 text-[14px] leading-snug font-medium text-white/90">
              {bandTitle.subtitle}
            </p>
          </div>
        ) : (
          <div className="h-7 lg:h-9" />
        )}
        <Wave />
      </div>
    </>
  );
}

/**
 * Band title + subtitle for every self-service page, so they all share the
 * Profil Saya header. Matched by route prefix (detail pages inherit their
 * list's title). Pages keep their own h1, visually hidden in the employee
 * frame (`.emp-page-title`, globals.css).
 */
const EMPLOYEE_BAND_TITLES: Array<[string, { title: string; subtitle: string }]> = [
  ["/settings/account", { title: "Profil Saya", subtitle: "Kelola informasi akun dan data kepegawaian Anda." }],
  ["/attendance", { title: "Absensi", subtitle: "Riwayat, rekap, dan presensi kehadiran Anda." }],
  ["/face-id", { title: "Face ID", subtitle: "Data wajah untuk verifikasi absensi Anda." }],
  ["/leave", { title: "Cuti", subtitle: "Ajukan cuti, pantau saldo dan riwayatnya." }],
  ["/permission", { title: "Izin Kegiatan", subtitle: "Ajukan dan pantau izin kegiatan Anda." }],
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
 * Self-service top bar: HRIS mark + wordmark, the company logo plate,
 * notifications and the profile photo. No menu button (every page is on
 * Beranda) and fixed sizes, so the brand and the company logo look the same
 * on every phone from 360px up and in the desktop frame. Only below 360px does the plate
 * give up width (its logo scales down inside, never disappears).
 */
function EmployeeTopBar() {
  const { profile, notificationCount } = useShell();
  return (
    <div className="relative z-10 flex h-[72px] items-center gap-1.5 px-3.5">
      <Link
        href="/dashboard"
        className="flex shrink-0 items-center gap-2"
        aria-label="HRIS — Beranda"
      >
        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
          <BrandMark size={33} priority />
        </span>
        <span className="leading-none">
          <span className="block text-[20px] font-extrabold tracking-tight">HRIS</span>
          <span className="mt-0.5 block w-[4.6rem] text-[8.5px] leading-[1.15] font-medium text-white/85">
            Human Resource Information System
          </span>
        </span>
      </Link>

      {profile.organizationName ? (
        <span className="flex min-w-0 items-center">
          <span aria-hidden="true" className="mx-1.5 h-8 w-px shrink-0 bg-white/40" />
          <span
            className="flex h-9 w-[5.25rem] min-w-[3.5rem] shrink items-center justify-center rounded-full bg-white px-2.5 shadow-sm"
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
              <span className="truncate text-[12px] font-extrabold tracking-tight text-[var(--brand-navy)]">
                {profile.organizationName}
              </span>
            )}
          </span>
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
        className="relative flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <HrisIcon name="bell" className="size-[26px]" />
        {notificationCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-3 rounded-full bg-[#FF3B47] ring-2 ring-[var(--brand-band-via)]" />
        ) : null}
      </Link>
      <Link href="/settings/account" aria-label="Profil saya" className="shrink-0">
        <Avatar profile={profile} size={40} className="ring-2 ring-white/30" />
      </Link>
    </div>
  );
}

function Greeting({ employeeFrame }: { employeeFrame: boolean }) {
  const { profile } = useShell();
  const title = profile.position?.trim() || profile.roleLabel;

  return (
    <div
      className={cn(
        "relative px-4 pt-2 sm:px-8 lg:px-14 lg:pt-1 lg:pb-12",
        // The self-service clock / weather cards overlap the wave.
        employeeFrame ? "pb-14" : "pb-10"
      )}
    >
      <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0">
          <p
            className={cn(
              "font-medium text-white/95 lg:text-xl",
              employeeFrame ? "text-[17px]" : "text-[19px]"
            )}
          >
            {profile.greeting},
          </p>
          <p
            className={cn(
              "mt-0.5 leading-tight font-extrabold tracking-tight text-white",
              employeeFrame
                ? "truncate text-[clamp(22px,6.6vw,28px)]"
                : "text-[28px] sm:text-[30px] lg:text-[34px]"
            )}
          >
            {profile.displayName}
          </p>
          {title ? (
            <p
              className={cn(
                "flex items-center gap-2 font-medium text-white/90 lg:text-lg",
                employeeFrame ? "mt-1.5 text-[15px]" : "mt-2 text-[17px]"
              )}
            >
              <HrisIcon
                name="briefcase"
                className={cn("shrink-0 text-white/85", employeeFrame ? "size-5" : "size-6")}
              />
              <span className="min-w-0 truncate">{title}</span>
            </p>
          ) : null}
        </div>

        {/* Desktop keeps the organization identity in the hero; on mobile it
            sits in the top bar next to the brand. */}
        {profile.organizationName ? (
          <p
            className={cn(
              "hidden items-center gap-3 text-[15px] font-semibold text-white lg:flex lg:text-base"
            )}
          >
            <OrganizationIdentity
              name={profile.organizationName}
              logoUrl={profile.organizationLogoUrl ?? null}
              plate
              imgClassName="h-10 max-w-[14rem]"
              textClassName="truncate"
            />
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Wave() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 1440 64"
      preserveAspectRatio="none"
      className="hris-wave absolute inset-x-0 -bottom-px h-8 lg:h-12"
    >
      <path
        d="M0 46C180 18 360 6 560 22s420 44 640 30c120-8 190-26 240-40v52H0z"
        fill="currentColor"
      />
    </svg>
  );
}
