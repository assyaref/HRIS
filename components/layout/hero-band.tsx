"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";

import { BuildingIllustration } from "./building-illustration";
import { HrisIcon } from "./icons";
import { useShell } from "./shell-context";
import { Avatar, UserMenu } from "./user-menu";

/**
 * The blue band at the top of every authenticated page.
 *
 * Holds the top bar (menu, search, notifications, account) and — on Beranda —
 * the greeting hero with the office illustration. Other pages get a short
 * band so the whole app keeps the same header. The band closes with a soft
 * wave into the page background.
 */
export function HeroBand() {
  const pathname = usePathname();
  const isHome = pathname === "/dashboard" || pathname === "/";

  return (
    <div className="hris-band relative isolate overflow-hidden">
      <TopBar />
      {isHome ? <Greeting /> : <div className="h-7 lg:h-9" />}
      <Wave />
    </div>
  );
}

function TopBar() {
  const { profile, notificationCount, toggleCollapsed, setDrawerOpen, setPaletteOpen } =
    useShell();

  return (
    <div className="relative z-10 flex h-[72px] items-center gap-2 px-4 sm:gap-3 lg:h-[76px] lg:px-8">
      {/* Mobile: open drawer. Desktop: collapse the sidebar. */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Buka menu navigasi"
        aria-haspopup="dialog"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none lg:hidden"
      >
        <HrisIcon name="menu" className="size-6" />
      </button>
      <button
        type="button"
        onClick={toggleCollapsed}
        aria-label="Ciutkan atau perluas sidebar"
        className="hidden size-10 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none lg:flex"
      >
        <HrisIcon name="menu" className="size-6" />
      </button>

      {/* Mobile brand */}
      <Link
        href="/dashboard"
        className="flex min-w-0 items-center gap-2.5 lg:hidden"
        aria-label="HRIS Lite Enterprise — Beranda"
      >
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-sm">
          <Image
            src="/brand/hris-logo.png"
            alt=""
            width={44}
            height={44}
            priority
            className="size-11 object-contain p-1"
          />
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block text-lg font-extrabold tracking-tight">HRIS</span>
          <span className="block truncate text-xs text-white/85">
            Lite Enterprise v2.0
          </span>
        </span>
      </Link>

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

      <div className="flex-1" />

      <Link
        href="/notifications"
        aria-label={
          notificationCount > 0
            ? `Notifikasi, ${notificationCount} belum dibaca`
            : "Notifikasi"
        }
        className="relative flex size-11 shrink-0 items-center justify-center rounded-xl text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <HrisIcon name="bell" className="size-[26px]" />
        {notificationCount > 0 ? (
          <span className="absolute top-1.5 right-1.5 size-3 rounded-full bg-[#FF3B47] ring-2 ring-[var(--brand-band-via)]" />
        ) : null}
      </Link>

      <div className="hidden lg:block">
        <UserMenu profile={profile} />
      </div>
      <Link href="/settings/account" aria-label="Profil saya" className="lg:hidden">
        <Avatar profile={profile} size={44} className="ring-2 ring-white/30" />
      </Link>
    </div>
  );
}

function Greeting() {
  const { profile } = useShell();
  const identity = [profile.roleLabel, profile.employeeNumber]
    .filter(Boolean)
    .join(" • ");

  return (
    <div className="relative">
      {/* Desktop illustration */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-2 -bottom-1 hidden h-[200px] w-[440px] md:block xl:h-[232px] xl:w-[540px]"
      >
        <BuildingIllustration variant="band" idPrefix="hero" className="size-full" />
      </div>

      {/* Mobile illustration badge */}
      <div
        aria-hidden="true"
        className="absolute top-0 -right-7 size-[128px] overflow-hidden rounded-full bg-white shadow-[0_12px_30px_-12px_rgb(0_0_0/0.45)] ring-4 ring-white/25 sm:-right-4 md:hidden"
      >
        <BuildingIllustration variant="badge" idPrefix="hero-badge" className="size-full" />
      </div>

      <div className="relative px-6 pt-1 pb-10 sm:px-8 lg:px-14 lg:pt-0 lg:pb-12">
        <p className="text-lg font-medium text-white/95 lg:text-[19px]">
          {profile.greeting},
        </p>
        <p className="mt-1 max-w-[calc(100%-5.75rem)] text-[24px] leading-tight font-extrabold tracking-tight text-white sm:text-[26px] md:max-w-none lg:text-[32px]">
          {profile.displayName}{" "}
          <span aria-hidden="true" className="inline-block">👋</span>
        </p>
        {identity ? (
          <p className="mt-1.5 text-[15px] font-medium text-white/90 lg:text-base">
            {identity}
          </p>
        ) : null}
        {profile.organizationName ? (
          <p
            className={cn(
              "mt-4 flex max-w-[calc(100%-6rem)] items-center gap-3 border-t border-white/20 pt-4 text-[15px] font-semibold text-white md:max-w-md md:border-t-0 md:pt-0 lg:text-base"
            )}
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/15">
              <HrisIcon name="building" className="size-[18px]" />
            </span>
            <span className="truncate">{profile.organizationName}</span>
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
