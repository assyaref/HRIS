"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import { logoutAction } from "@/features/auth/actions";
import { createTabTrap, getFocusableElements } from "@/lib/utils/focus";
import { cn } from "@/lib/utils/cn";
import type { NavItem } from "@/types/navigation";

import { BrandLogo } from "./brand";
import { HrisIcon } from "./icons";
import { resolveActiveHref } from "./navigation";
import { useShell } from "./shell-context";
import { Avatar } from "./user-menu";
import { OrganizationSwitcher } from "./organization-switcher";

/**
 * Mobile navigation drawer (below `lg`).
 *
 * Blue header with the brand, close button and the signed-in profile (online
 * dot), a white menu with round icon wells and a gradient pill for the active
 * page, then a red "Keluar". Focus trap, Escape, scroll lock and backdrop
 * close. Groups are shown flattened so every page is one tap away.
 */
export function AppDrawer() {
  const { sections, hrefs, profile, notificationCount, drawerOpen, setDrawerOpen } =
    useShell();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const activeHref = resolveActiveHref(pathname, hrefs);

  useEffect(() => {
    if (!drawerOpen) return;
    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const trapTab = createTabTrap(panel);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
        return;
      }
      trapTab(event);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => getFocusableElements(panel)[0]?.focus());
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [drawerOpen, setDrawerOpen]);

  if (!drawerOpen) return null;

  const close = () => setDrawerOpen(false);
  const flatten = (items: NavItem[]): NavItem[] =>
    items.flatMap((item) => (item.children ? flatten(item.children) : [item]));
  const groups = sections.map((section) => ({
    title: section.title,
    items: flatten(section.items),
  }));
  const identity = [profile.employeeNumber, profile.roleLabel].filter(Boolean).join(" • ");

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-slate-950/45 backdrop-blur-[1px]"
        onClick={close}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Menu navigasi"
        className="absolute inset-y-0 left-0 flex w-[86%] max-w-[360px] flex-col overflow-hidden rounded-r-[28px] bg-card shadow-2xl"
      >
        {/* Blue header */}
        <div className="hris-band relative shrink-0 px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-10">
          <div className="flex items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="hris-logo-plate inline-flex max-w-full rounded-2xl px-3 py-2 shadow-sm">
                <BrandLogo height={46} />
              </span>
            </span>
            <button
              type="button"
              onClick={close}
              aria-label="Tutup menu"
              className="flex size-10 shrink-0 items-center justify-center rounded-full text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
            >
              <HrisIcon name="close" className="size-7" />
            </button>
          </div>

          <div className="mt-6 flex items-center gap-3.5">
            <span className="relative shrink-0">
              <Avatar
                profile={profile}
                size={60}
                tone="light"
                className="border-[3px] border-white"
              />
              <span className="absolute right-0 bottom-0.5 size-4 rounded-full bg-[#22C55E] ring-[3px] ring-white" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-lg font-bold">{profile.displayName}</p>
              {identity ? (
                <p className="truncate text-sm text-white/85">{identity}</p>
              ) : null}
            </div>
          </div>

          <svg
            aria-hidden="true"
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
            className="absolute inset-x-0 -bottom-px h-8 w-full text-card"
          >
            <path d="M0 26C90 6 190 0 280 12s90 18 120 10v18H0z" fill="currentColor" />
          </svg>
        </div>

        {profile.isSuperAdmin &&
        profile.organizationName &&
        profile.organizationOptions?.length ? (
          <div className="shrink-0 border-b border-border px-5 pt-1 pb-3">
            <OrganizationSwitcher
              name={profile.organizationName}
              logoUrl={profile.organizationLogoUrl ?? null}
              activeOrganizationId={profile.activeOrganizationId ?? null}
              options={profile.organizationOptions}
            />
          </div>
        ) : null}

        {/* Menu */}
        <nav aria-label="Menu navigasi" className="flex-1 overflow-y-auto px-4 pt-1 pb-3">
          {groups.map((group, index) => (
            <div key={group.title ?? index} className={cn(index > 0 && "mt-3 border-t border-border pt-3")}>
              {groups.length > 1 && group.title ? (
                <p className="px-3 pb-1.5 text-[11px] font-bold tracking-[0.08em] text-muted-foreground uppercase">
                  {group.title}
                </p>
              ) : null}
              <ul className="space-y-1">
                {group.items.map((item) => {
                  const active = item.href === activeHref;
                  const count = item.badge === "notifications" ? notificationCount : 0;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={close}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "flex min-h-[54px] items-center gap-4 rounded-2xl px-3 text-[17px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                          active ? "hris-nav-active" : "text-foreground hover:bg-muted"
                        )}
                      >
                        <span
                          className={cn(
                            "flex size-11 shrink-0 items-center justify-center rounded-full",
                            active ? "bg-white/15 text-white" : "bg-muted text-foreground/80"
                          )}
                        >
                          <HrisIcon name={item.icon ?? "dashboard"} className="size-[22px]" />
                        </span>
                        <span className="min-w-0 flex-1 truncate">{item.title}</span>
                        {count > 0 ? (
                          <span className="flex min-w-6 items-center justify-center rounded-full bg-[#EF4444] px-1.5 py-0.5 text-[11px] font-bold text-white">
                            {count > 99 ? "99+" : count}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-border px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <form action={logoutAction}>
            <button
              type="submit"
              className="flex min-h-[54px] w-full items-center gap-4 rounded-2xl px-3 text-[17px] font-semibold text-[#EF4444] transition-colors hover:bg-surface-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-surface-danger">
                <HrisIcon name="logout" className="size-[22px]" />
              </span>
              Keluar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
