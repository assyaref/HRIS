"use client";

import Link from "next/link";

import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils/cn";
import { longDateLabel } from "@/lib/utils/greeting";

import { BrandMark } from "./brand";
import { HeroWidgets } from "./hero-widgets";
import { HrisIcon, type HrisIconName } from "./icons";
import { resolveNavTrail } from "./navigation";
import { useShell } from "./shell-context";
import { Avatar, UserMenu } from "./user-menu";

const NESTED_LABELS: Record<string, string> = {
  new: "Baru",
  edit: "Ubah",
  upload: "Unggah",
  "bulk-upload": "Unggah Massal",
  components: "Komponen",
  readiness: "Kesiapan",
};

/** Breadcrumb trail + module icon for `pathname` (authorized sections only). */
function usePageTrail(pathname: string) {
  const { sections } = useShell();
  const trail = resolveNavTrail(pathname, sections);
  const lastSegment = pathname.split("/").filter(Boolean).at(-1) ?? "";
  const nestedLabel = trail?.nested
    ? (NESTED_LABELS[lastSegment] ?? "Detail")
    : null;

  const crumbs: Array<{ label: string; href?: string }> = [];
  // "Menu Utama" is the default section: it adds nothing to the trail.
  if (trail?.section && trail.section !== "Menu Utama") {
    crumbs.push({ label: trail.section });
  }
  if (trail?.group) crumbs.push({ label: trail.group.title });
  if (trail) {
    crumbs.push({
      label: trail.item.title,
      href: nestedLabel ? trail.item.href : undefined,
    });
  }
  if (nestedLabel) crumbs.push({ label: nestedLabel });

  return {
    icon: (trail?.item.icon ?? trail?.group?.icon ?? "grid") as HrisIconName,
    // A group named like its section ("Pengaturan › Pengaturan") shows once.
    crumbs: crumbs.filter(
      (crumb, index) => index === 0 || crumb.label !== crumbs[index - 1].label
    ),
  };
}

const iconButton =
  "relative flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-foreground/75 transition-colors hover:bg-surface-primary hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * Management top bar (v9): a row of floating white cards on the light canvas
 * — greeting or breadcrumb, active organization, search, quick icons and the
 * account. Replaces the blue band outside the employee frame; the same
 * routes keep their server-side guards.
 */
export function AdminTopBar({
  pathname,
  isHome,
}: {
  pathname: string;
  isHome: boolean;
}) {
  const {
    profile,
    notificationCount,
    setDrawerOpen,
    setPaletteOpen,
    collapsed,
    toggleCollapsed,
  } = useShell();
  const { theme, setTheme } = useTheme();
  const dark = theme === "dark";
  const { icon, crumbs } = usePageTrail(pathname);
  const firstName = profile.displayName.split(" ")[0] || profile.displayName;

  return (
    <>
      <header className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-10 lg:pt-6">
        <div className="flex flex-wrap items-stretch gap-3 lg:flex-nowrap">
          {/* Mobile: menu + brand */}
          <div className="hris-top-card flex items-center gap-2 px-2 lg:hidden">
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              aria-label="Buka menu navigasi"
              aria-haspopup="dialog"
              className={iconButton}
            >
              <HrisIcon name="menu" className="size-5" />
            </button>
            <Link
              href="/dashboard"
              aria-label="HRIS — Beranda"
              className="flex items-center gap-1.5 pr-1.5"
            >
              <BrandMark size={30} priority />
              <span className="text-[17px] font-extrabold tracking-tight text-[var(--brand-navy)] dark:text-white">
                HRIS
              </span>
            </Link>
          </div>

          {/* Desktop: collapse / expand the sidebar */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
            aria-expanded={!collapsed}
            className="hris-top-card hidden w-16 shrink-0 items-center justify-center text-foreground/75 transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:flex"
          >
            <HrisIcon name="menu" className="size-5" />
          </button>

          {/* Greeting (Beranda) or breadcrumb */}
          <div className="hris-top-card order-last flex min-w-0 basis-full items-center gap-3.5 px-4 py-3 lg:order-none lg:basis-auto lg:flex-1 lg:px-5">
            {isHome ? (
              <div className="min-w-0">
                <p className="truncate text-[17px] leading-tight font-semibold text-foreground">
                  {profile.greeting}, {firstName}
                </p>
                <p className="mt-1 truncate text-[13px] text-muted-foreground">
                  Ringkasan terbaru sistem Anda ada di sini
                </p>
              </div>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="hris-chip-blue flex size-10 shrink-0 items-center justify-center rounded-full"
                >
                  <HrisIcon name={icon} className="size-5" />
                </span>
                <div className="min-w-0">
                  <nav aria-label="Navigasi jejak">
                    <ol className="flex min-w-0 flex-wrap items-center gap-x-1 text-[12px] font-medium text-muted-foreground">
                      <li>
                        <Link href="/dashboard" className="rounded hover:text-primary">
                          Beranda
                        </Link>
                      </li>
                      {crumbs.slice(0, -1).map((crumb) => (
                        <li key={crumb.label} className="flex items-center gap-1">
                          <HrisIcon name="chevron-right" className="size-3 opacity-60" />
                          {crumb.href ? (
                            <Link href={crumb.href} className="rounded hover:text-primary">
                              {crumb.label}
                            </Link>
                          ) : (
                            <span>{crumb.label}</span>
                          )}
                        </li>
                      ))}
                    </ol>
                  </nav>
                  <p
                    aria-current="page"
                    className="mt-0.5 truncate text-[16px] leading-tight font-semibold text-foreground"
                  >
                    {crumbs.at(-1)?.label ?? "HRIS"}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Active organization + date */}
          {profile.organizationName ? (
            <div className="hris-top-card hidden min-w-0 items-center gap-3 px-4 2xl:flex">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-foreground/70"
              >
                {profile.organizationLogoUrl ? (
                  // Authenticated image route; next/image cannot optimise it.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.organizationLogoUrl}
                    alt=""
                    className="max-h-6 max-w-8 object-contain"
                  />
                ) : (
                  <HrisIcon name="building" className="size-5" />
                )}
              </span>
              <div className="min-w-0">
                <p className="max-w-[11rem] truncate text-[15px] leading-tight font-semibold text-foreground">
                  {profile.organizationName}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                  {longDateLabel().split(",")[0]}
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-success" />
                </p>
              </div>
            </div>
          ) : null}

          {/* Search */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="hris-top-card hidden w-[260px] shrink-0 items-center gap-3 px-3 text-left transition-colors hover:border-primary/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:flex xl:w-[320px]"
          >
            <span className={cn(iconButton, "pointer-events-none")}>
              <HrisIcon name="search" className="size-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] leading-tight font-semibold text-foreground">
                Cari
              </span>
              <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                Karyawan, menu, atau data
              </span>
            </span>
            <span className="hidden items-center gap-1 xl:flex">
              <kbd className="hris-kbd-light">Ctrl</kbd>
              <kbd className="hris-kbd-light">K</kbd>
            </span>
          </button>

          {/* Quick icons + account */}
          <div className="hris-top-card ml-auto flex items-center gap-2 px-2.5 lg:ml-0">
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              aria-label="Cari"
              className={cn(iconButton, "lg:hidden")}
            >
              <HrisIcon name="search" className="size-[18px]" />
            </button>
            <button
              type="button"
              onClick={() => setTheme(dark ? "light" : "dark")}
              aria-label={dark ? "Mode terang" : "Mode gelap"}
              className={cn(iconButton, "hidden sm:flex")}
            >
              <HrisIcon name={dark ? "sun" : "moon"} className="size-[18px]" />
            </button>
            <Link
              href="/notifications"
              aria-label={
                notificationCount > 0
                  ? `Notifikasi, ${notificationCount} belum dibaca`
                  : "Notifikasi"
              }
              className={iconButton}
            >
              <HrisIcon name="bell" className="size-[19px]" />
              {notificationCount > 0 ? (
                <span className="absolute top-1.5 right-2 size-2.5 rounded-full bg-[#FF3B47] ring-2 ring-card" />
              ) : null}
            </Link>
            <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-border lg:block" />
            <div className="hidden lg:block">
              <UserMenu profile={profile} variant="card" />
            </div>
            <Link href="/settings/account" aria-label="Profil saya" className="shrink-0 lg:hidden">
              <Avatar profile={profile} size={40} />
            </Link>
          </div>
        </div>
      </header>

      {isHome ? (
        <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 lg:px-10">
          <HeroWidgets />
        </div>
      ) : null}
      <div aria-hidden="true" className="h-4 lg:h-6" />
    </>
  );
}
