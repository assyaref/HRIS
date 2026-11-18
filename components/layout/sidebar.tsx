"use client";

import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import { BrandLogo, BrandMark } from "./brand";
import { HrisIcon } from "./icons";
import { NavLinks } from "./nav-links";
import {
  OrganizationMonogram,
  OrganizationSwitcher,
} from "./organization-switcher";
import { useShell } from "./shell-context";
import { Avatar } from "./user-menu";

/**
 * Desktop sidebar (HRIS Lite Enterprise v2.0). Hidden below `lg`.
 *
 * White rail with a blue gradient brand block (curved bottom edge), the
 * organization chip, and grouped navigation. Collapses to an icon rail; the
 * choice is remembered per browser.
 */
export function Sidebar() {
  const { sections, profile, notificationCount, collapsed, toggleCollapsed } =
    useShell();

  return (
    <aside
      className={cn(
        "hris-sidebar sticky top-0 z-20 hidden h-svh shrink-0 flex-col border-r border-sidebar-border transition-[width] duration-200 lg:flex",
        collapsed ? "w-[88px]" : "w-72"
      )}
    >
      {/* Brand block */}
      <div
        className={cn(
          "hris-sidebar-brand relative flex h-[116px] shrink-0 items-center gap-2 pb-1.5",
          collapsed ? "justify-center px-3" : "pr-4 pl-5"
        )}
      >
        <Link
          href="/dashboard"
          aria-label="HRIS — Beranda"
          className="flex min-w-0 flex-col items-start gap-1 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          {collapsed ? (
            <span className="hris-logo-plate flex size-14 items-center justify-center rounded-2xl">
              <BrandMark size={48} priority />
            </span>
          ) : (
            <span className="hris-logo-plate flex">
              <BrandLogo height={60} priority />
            </span>
          )}
        </Link>
        {collapsed ? null : (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Ciutkan sidebar"
            className="ml-auto flex size-9 shrink-0 items-center justify-center self-start mt-6 rounded-full bg-sidebar-hover text-sidebar-muted transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <HrisIcon name="chevron-left" className="size-[18px]" />
          </button>
        )}
      </div>

      {/* Organization chip */}
      {profile.organizationName ? (
        <div className={cn("shrink-0 pt-5 pb-2", collapsed ? "px-3" : "px-5")}>
          {profile.isSuperAdmin && profile.organizationOptions?.length ? (
            <OrganizationSwitcher
              name={profile.organizationName}
              logoUrl={profile.organizationLogoUrl ?? null}
              activeOrganizationId={profile.activeOrganizationId ?? null}
              options={profile.organizationOptions}
              collapsed={collapsed}
            />
          ) : (
            <OrganizationChip
              name={profile.organizationName}
              logoUrl={profile.organizationLogoUrl ?? null}
              collapsed={collapsed}
            />
          )}
        </div>
      ) : null}

      <div
        className={cn(
          "flex-1 overflow-y-auto pt-4 pb-6",
          collapsed ? "px-3" : "px-4"
        )}
      >
        <NavLinks
          sections={sections}
          collapsed={collapsed}
          notificationCount={notificationCount}
        />
      </div>

      {/* Signed-in identity */}
      <div className={cn("shrink-0 pb-4", collapsed ? "px-3" : "px-4")}>
        <Link
          href="/settings/account"
          title={collapsed ? profile.displayName : undefined}
          className={cn(
            "hris-sidebar-profile group flex items-center gap-3 rounded-2xl transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            collapsed ? "justify-center p-2" : "p-3"
          )}
        >
          <Avatar
            profile={profile}
            size={collapsed ? 40 : 42}
            tone="light"
            className="ring-2 ring-white/40"
          />
          {collapsed ? null : (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold">
                  {profile.displayName}
                </span>
                <span className="mt-0.5 block truncate text-xs text-white/75">
                  {profile.roleLabel ?? profile.email}
                </span>
              </span>
              <HrisIcon
                name="chevron-right"
                className="size-4 shrink-0 text-white/70 transition-transform group-hover:translate-x-0.5"
              />
            </>
          )}
        </Link>
      </div>
    </aside>
  );
}

function OrganizationChip({
  name,
  collapsed,
}: {
  name: string;
  logoUrl: string | null;
  collapsed: boolean;
}) {
  // Text-only, like the Super Administrator switcher (no logo).
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl",
        collapsed
          ? "justify-center"
          : "border border-sidebar-border bg-sidebar-panel px-2.5 py-2.5"
      )}
      title={collapsed ? name : undefined}
    >
      <OrganizationMonogram name={name} />
      {collapsed ? null : (
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-medium text-muted-foreground">
            Organisasi
          </span>
          <span className="mt-0.5 block truncate text-[14.5px] font-semibold text-foreground">
            {name}
          </span>
        </span>
      )}
    </div>
  );
}
