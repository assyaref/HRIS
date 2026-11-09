"use client";

import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

import { HrisIcon } from "./icons";
import { NavLinks } from "./nav-links";
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
          "hris-sidebar-brand relative flex shrink-0 items-center gap-3 pt-5 pb-7",
          collapsed ? "justify-center px-3" : "px-6"
        )}
      >
        <Link
          href="/dashboard"
          aria-label="HRIS Lite Enterprise — Beranda"
          className="flex min-w-0 items-center gap-3 rounded-2xl focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
        >
          <span className="flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-white shadow-[0_8px_18px_-10px_rgb(0_0_0/0.45)]">
            <Image
              src="/brand/hris-logo.png"
              alt=""
              width={52}
              height={52}
              priority
              className="size-[52px] object-contain p-1.5"
            />
          </span>
          {collapsed ? null : (
            <span className="min-w-0 leading-tight">
              <span className="block text-[22px] font-extrabold tracking-tight">
                HRIS
              </span>
              <span className="block truncate text-[13px] font-medium text-white/85">
                Lite Enterprise v2.0
              </span>
            </span>
          )}
        </Link>
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}
          aria-pressed={collapsed}
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none",
            collapsed ? "absolute -right-3 bottom-2 size-7 bg-primary shadow-md ring-2 ring-white" : "ml-auto"
          )}
        >
          <HrisIcon
            name={collapsed ? "chevron-right" : "chevron-left"}
            className="size-[18px]"
          />
        </button>
      </div>

      {/* Organization chip */}
      {profile.organizationName ? (
        <div className={cn("shrink-0 pt-5 pb-2", collapsed ? "px-3" : "px-5")}>
          <OrganizationChip
            name={profile.organizationName}
            collapsed={collapsed}
            canSwitch={profile.isSuperAdmin}
          />
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
  collapsed,
  canSwitch,
}: {
  name: string;
  collapsed: boolean;
  canSwitch: boolean;
}) {
  const body = (
    <>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-primary text-primary">
        <HrisIcon name="building" className="size-[18px]" />
      </span>
      {collapsed ? null : (
        <>
          <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-foreground">
            {name}
          </span>
          {canSwitch ? (
            <HrisIcon name="chevron-down" className="size-[18px] shrink-0 text-muted-foreground" />
          ) : null}
        </>
      )}
    </>
  );

  const className = cn(
    "flex items-center gap-3 border-b border-sidebar-border pb-4",
    collapsed && "justify-center border-b-0 pb-0"
  );

  // Super administrators manage several organizations: the chip opens the
  // organization directory. Everyone else sees a static label.
  return canSwitch ? (
    <Link
      href="/settings/organizations"
      title={collapsed ? name : "Kelola organisasi"}
      className={cn(className, "rounded-lg transition-colors hover:text-primary")}
    >
      {body}
    </Link>
  ) : (
    <div className={className} title={collapsed ? name : undefined}>
      {body}
    </div>
  );
}
