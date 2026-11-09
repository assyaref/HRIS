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
  /** "light" for the light sidebar / mobile drawer. */
  variant?: "light";
}

/** Whether a dashboard-relative href is the currently active route. */
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Presentational link list shared by the desktop sidebar and mobile drawer.
 *
 * MD3 Soft Blue: muted blue-gray navigation text, soft lavender/blue active
 * container, rounded active indicator, gentle hover background, consistent
 * iconography, comfortable vertical spacing.
 */
export function NavLinks({ sections, onNavigate, variant = "light" }: NavLinksProps) {
  const pathname = usePathname();

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <nav
          key={section.title ?? "primary"}
          aria-label={section.title ?? "Main navigation"}
        >
          {section.title ? (
            <h2 className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground">
              {section.title}
            </h2>
          ) : null}
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const active = isActivePath(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "group flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-surface-primary text-primary"
                        : "text-muted-foreground hover:bg-accent hover:text-primary"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center transition-colors",
                        active
                          ? "text-primary"
                          : "text-muted-foreground group-hover:text-primary"
                      )}
                    >
                      <HrisIcon name={item.icon ?? "dashboard"} className="size-[18px]" />
                    </span>
                    {item.title}
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
