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
  /** "navy" for the dark sidebar; "light" for the mobile drawer / light shell. */
  variant?: "light" | "navy";
}

/** Whether a dashboard-relative href is the currently active route. */
function isActivePath(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Presentational link list shared by the desktop sidebar and mobile drawer. */
export function NavLinks({ sections, onNavigate, variant = "light" }: NavLinksProps) {
  const pathname = usePathname();
  const isNavy = variant === "navy";

  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <nav
          key={section.title ?? "primary"}
          aria-label={section.title ?? "Main navigation"}
        >
          {section.title ? (
            <h2 className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider uppercase">
              {isNavy
                ? "text-slate-400"
                : "text-slate-400 dark:text-slate-300"}
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
                      "group flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? isNavy
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary text-secondary-foreground ring-1 ring-blue-100/80"
                        : isNavy
                          ? "text-slate-300 hover:bg-white/10 hover:text-white"
                          : "text-slate-500 dark:text-slate-400 hover:bg-accent hover:text-accent-foreground"
                    )}
                  >
                    <span
                      className={cn(
                        "flex size-5 shrink-0 items-center justify-center transition-colors",
                        active
                          ? "text-primary-foreground"
                          : isNavy
                            ? "text-slate-400 group-hover:text-slate-200"
                            : "text-slate-400 dark:text-slate-500 group-hover:text-slate-500"
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
