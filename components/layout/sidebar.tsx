"use client";

import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import { BrandLogo, BrandMark } from "./brand";
import { HrisIcon } from "./icons";
import { NavLinks } from "./nav-links";
import {
  OrganizationIdentity,
  OrganizationInitial,
  OrganizationSwitcher,
} from "./organization-switcher";
import { useShell } from "./shell-context";

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
              className={cn(!collapsed && "border-b border-sidebar-border pb-4")}
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
    </aside>
  );
}

function OrganizationChip({
  name,
  logoUrl,
  collapsed,
}: {
  name: string;
  logoUrl: string | null;
  collapsed: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 border-b border-sidebar-border pb-4",
        collapsed && "justify-center border-b-0 pb-0"
      )}
      title={collapsed ? name : undefined}
    >
      {collapsed ? (
        <OrganizationInitial name={name} logoUrl={logoUrl} />
      ) : (
        <OrganizationIdentity
          name={name}
          logoUrl={logoUrl}
          className="flex-1"
          imgClassName="h-10"
          textClassName="text-[15px] font-semibold text-foreground"
        />
      )}
    </div>
  );
}
