"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils/cn";
import type { NavSection } from "@/types/navigation";

import { HrisIcon } from "./icons";

interface NavLinksProps {
  /** Navigation sections to render (already permission-filtered server-side). */
  sections: NavSection[];
  /** Called after a link is activated (e.g. close the mobile drawer). */
  onNavigate?: () => void;
  /** "dark" for the navy navigation rail / drawer, "light" for light surfaces. */
  variant?: "light" | "dark";
}

/** Whether a dashboard-relative href is the currently active route. */
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Presentational link list shared by the desktop sidebar and mobile drawer.
 *
 * Dark (navy rail): muted blue-gray labels, white on hover, solid primary
 * pill with soft blue glow for the active route.
 * Light: muted labels, tinted primary container for the active route.
 */
export function NavLinks({ sections, onNavigate, variant = "dark" }: NavLinksProps) {
  const pathname = usePathname();
  const dark = variant === "dark";

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <nav
          key={section.title ?? "primary"}
          aria-label={section.title ?? "Main navigation"}
        >
          {section.title ? (
            <h2
              className={cn(
                "px-3 pb-1.5 text-[10px] font-semibold tracking-[0.12em] uppercase",
                dark ? "text-sidebar-muted" : "text-muted-foreground"
              )}
            >
              {section.title}
            </h2>
          ) : null}
          <ul className="space-y-1">
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
                      dark
                        ? active
                          ? "hris-nav-active focus-visible:ring-white/70"
                          : "text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-strong focus-visible:ring-white/50"
                        : active
                          ? "bg-surface-primary font-semibold text-primary focus-visible:ring-ring"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-ring"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center transition-colors",
                        dark
                          ? active
                            ? "text-white"
                            : "text-sidebar-muted group-hover:text-sidebar-strong"
                          : active
                            ? "text-primary"
                            : "text-muted-foreground group-hover:text-foreground"
                      )}
                    >
                      <HrisIcon name={item.icon ?? "dashboard"} className="size-[18px]" />
                    </span>
                    <span className="truncate">{item.title}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      ))}
    </div>
  );
}
