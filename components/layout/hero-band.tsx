"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

import { BrandMark } from "./brand";
import { HeroWidgets } from "./hero-widgets";
import { HrisIcon, type HrisIconName } from "./icons";
import { OrganizationIdentity } from "./organization-switcher";
import { useShell } from "./shell-context";
import { Avatar, UserMenu } from "./user-menu";

/**
 * The blue band at the top of every authenticated page.
 *
 * Holds the top bar (menu, brand, organization logo, notifications, account)
 * and — on Beranda — the greeting hero. Other pages get a short band so the
 * whole app keeps the same header. The band closes with a soft wave into the
 * page background; on Beranda the clock / weather / prayer-schedule cards
 * follow directly below it.
 */
export function HeroBand() {
  const pathname = usePathname();
  const isHome = pathname === "/dashboard" || pathname === "/";
  const pageHero = PAGE_HEROES[pathname];

  return (
    <>
      <div className="hris-band relative isolate overflow-hidden">
        <TopBar />
        {isHome ? (
          <Greeting />
        ) : pageHero ? (
          <PageHero {...pageHero} />
        ) : (
          <div className="h-7 lg:h-9" />
        )}
        <Wave />
      </div>
      {isHome ? (
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-3 sm:px-6 lg:px-10 lg:pt-4">
          <HeroWidgets />
        </div>
      ) : null}
    </>
  );
}

/**
 * Pages whose title lives in the blue band (icon + title + one-line
 * description, reference "Absensi" layout). The page's first card overlaps the
 * wave through `hris-band-overlap`. Keyed by the exact pathname.
 */
const PAGE_HEROES: Record<
  string,
  { icon: HrisIconName; title: string; description: string }
> = {
  "/attendance": {
    icon: "calendar-check",
    title: "Absensi",
    description: "Lihat riwayat dan rekap kehadiran Anda.",
  },
};

function PageHero({
  icon,
  title,
  description,
}: {
  icon: HrisIconName;
  title: string;
  description: string;
}) {
  return (
    <div className="relative px-4 pt-1 pb-16 sm:px-8 lg:px-14 lg:pb-16">
      <div className="mx-auto flex w-full max-w-[1400px] items-center gap-4 lg:px-0">
        <HrisIcon name={icon} className="size-14 shrink-0 text-white lg:size-16" />
        <div className="min-w-0">
          <h1 className="text-[32px] leading-tight font-extrabold tracking-tight text-white lg:text-[36px]">
            {title}
          </h1>
          <p className="mt-0.5 text-[17px] font-medium text-white/90 lg:text-lg">
            {description}
          </p>
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  const { profile, notificationCount, toggleCollapsed, setDrawerOpen, setPaletteOpen } =
    useShell();

  return (
    <div className="relative z-10 flex h-[72px] items-center gap-1.5 px-3 sm:gap-3 sm:px-4 lg:h-[76px] lg:px-8">
      {/* Mobile: open drawer. Desktop: collapse the sidebar. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Buka menu navigasi"
        aria-haspopup="dialog"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none lg:hidden"
      >
        <HrisIcon name="menu" className="size-7" />
      </button>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label="Ciutkan atau perluas sidebar"
        className="hidden size-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none lg:flex"
      >
        <HrisIcon name="menu" className="size-6" />
      </button>

      {/* Mobile brand: hexagon mark + wordmark + tagline */}
      <Link
        href="/dashboard"
        className="flex min-w-0 shrink-0 items-center gap-2 lg:hidden"
        aria-label="HRIS — Beranda"
      >
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
          <BrandMark size={36} priority />
        </span>
        <span className="min-w-0 leading-none">
          <span className="block text-[21px] font-extrabold tracking-tight">HRIS</span>
          <span className="mt-0.5 block w-[5.6rem] text-[9.5px] leading-[1.15] font-medium text-white/85">
            Human Resource Information System
          </span>
        </span>
      </Link>

      {/* Mobile organization plate, separated from the brand by a thin rule */}
      {profile.organizationName ? (
        <span className="hidden min-w-0 items-center gap-2 min-[380px]:flex lg:hidden">
          <span aria-hidden="true" className="h-9 w-px shrink-0 bg-white/40" />
          <OrganizationPlate
            name={profile.organizationName}
            logoUrl={profile.organizationLogoUrl ?? null}
          />
        </span>
      ) : null}

      {/* Desktop search */}
      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="hris-band-search ml-2 hidden h-12 w-full max-w-[480px] items-center gap-3 rounded-full px-4 text-left text-[15px] text-white/85 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none lg:flex"
      >
        <HrisIcon name="search" className="size-5 shrink-0 text-white" />
        <span className="min-w-0 flex-1 truncate">Cari karyawan, menu, atau data...</span>
        <span className="flex items-center gap-1">
          <kbd className="hris-kbd">Ctrl</kbd>
          <kbd className="hris-kbd">K</kbd>
        </span>
      </button>

      <div className="min-w-2 flex-1" />

      <Link
        href="/notifications"
        aria-label={
          notificationCount > 0
            ? `Notifikasi, ${notificationCount} belum dibaca`
            : "Notifikasi"
        }
        className="relative flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none sm:size-11"
      >
        <HrisIcon name="bell" className="size-[26px]" />
        {notificationCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-3 rounded-full bg-[#FF3B47] ring-2 ring-[var(--brand-band-via)]" />
        ) : null}
      </Link>

      <div className="hidden lg:block">
        <UserMenu profile={profile} />
      </div>
      <Link href="/settings/account" aria-label="Profil saya" className="shrink-0 lg:hidden">
        <Avatar profile={profile} size={44} className="ring-2 ring-white/30" />
      </Link>
    </div>
  );
}

/** The organization on a white pill: its logo when uploaded, else its name. */
function OrganizationPlate({
  name,
  logoUrl,
}: {
  name: string;
  logoUrl: string | null;
}) {
  if (logoUrl) {
    return (
      <OrganizationIdentity
        name={name}
        logoUrl={logoUrl}
        plate
        className="rounded-full px-3 py-1.5"
        imgClassName="h-5 max-w-[4.75rem]"
      />
    );
  }
  return (
    <span
      className="inline-flex max-w-[6rem] min-w-0 items-center rounded-full bg-white px-3 py-1.5 text-xs font-extrabold tracking-tight text-[var(--brand-navy)] shadow-sm"
      title={name}
    >
      <span className="truncate">{name}</span>
    </span>
  );
}

function Greeting() {
  const { profile } = useShell();
  const title = profile.position?.trim() || profile.roleLabel;

  return (
    <div className="relative px-4 pt-2 pb-10 sm:px-8 lg:px-14 lg:pt-1 lg:pb-12">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between md:gap-8">
        <div className="min-w-0">
          <p className="text-[19px] font-medium text-white/95 lg:text-xl">
            {profile.greeting},
          </p>
          <p className="mt-0.5 text-[28px] leading-tight font-extrabold tracking-tight text-white sm:text-[30px] lg:text-[34px]">
            {profile.displayName}
          </p>
          {title ? (
            <p className="mt-2 flex items-center gap-2 text-[17px] font-medium text-white/90 lg:text-lg">
              <HrisIcon name="briefcase" className="size-6 shrink-0 text-white/85" />
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
