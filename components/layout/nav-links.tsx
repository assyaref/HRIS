"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import { cn } from "@/lib/utils/cn";
import type { NavItem, NavSection } from "@/types/navigation";

import { HrisIcon } from "./icons";
import { flattenNavHrefs, resolveActiveHref } from "./navigation";

interface NavLinksProps {
  /** Navigation sections to render (already permission-filtered server-side). */
  sections: NavSection[];
  /** Called after a link is activated (e.g. close the mobile drawer). */
  onNavigate?: () => void;
  /** Icon-only rail (desktop collapsed sidebar). */
  collapsed?: boolean;
  /** Unread notifications for the `badge: "notifications"` item. */
  notificationCount?: number;
}

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "flex min-w-6 items-center justify-center rounded-full bg-[#EF4444] px-1.5 py-0.5 text-[11px] leading-4 font-bold text-white shadow-[0_4px_10px_-4px_rgb(239_68_68/0.8)]",
        className
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

const linkBase =
  "group relative flex min-h-11 items-center gap-3.5 rounded-xl px-3.5 py-2.5 text-[15px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
const linkIdle =
  "text-sidebar-foreground hover:bg-sidebar-hover hover:text-primary";
const iconIdle = "text-sidebar-foreground/80 group-hover:text-primary";

/**
 * Sidebar / drawer navigation (HRIS Lite v2): uppercase section headings,
 * outline icons, gradient pill for the active route, collapsible groups and
 * a red counter for unread notifications.
 */
export function NavLinks({
  sections,
  onNavigate,
  collapsed = false,
  notificationCount = 0,
}: NavLinksProps) {
  const pathname = usePathname();
  const activeHref = resolveActiveHref(pathname, flattenNavHrefs(sections));

  return (
    <div className={cn(collapsed ? "space-y-4" : "space-y-6")}>
      {sections.map((section) => (
        <nav
          key={section.title ?? "primary"}
          aria-label={section.title ?? "Navigasi utama"}
        >
          {section.title ? (
            collapsed ? (
              <div aria-hidden="true" className="mx-auto mb-2 h-px w-8 bg-sidebar-border" />
            ) : (
              <h2 className="px-3.5 pb-2 text-[11px] font-bold tracking-[0.08em] text-sidebar-muted uppercase">
                {section.title}
              </h2>
            )
          ) : null}
          <ul className="space-y-1">
            {section.items.map((item) =>
              item.children ? (
                <NavGroup
                  key={item.href}
                  item={item}
                  activeHref={activeHref}
                  collapsed={collapsed}
                  onNavigate={onNavigate}
                />
              ) : (
                <li key={item.href}>
                  <NavLeaf
                    item={item}
                    active={item.href === activeHref}
                    collapsed={collapsed}
                    onNavigate={onNavigate}
                    count={item.badge === "notifications" ? notificationCount : 0}
                  />
                </li>
              )
            )}
          </ul>
        </nav>
      ))}
    </div>
  );
}

function NavLeaf({
  item,
  active,
  collapsed,
  onNavigate,
  count = 0,
  nested = false,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  count?: number;
  nested?: boolean;
}) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.title : undefined}
      className={cn(
        linkBase,
        collapsed && "justify-center px-0",
        nested && !collapsed && "min-h-10 py-2 pl-12 text-sm",
        active ? "hris-nav-active font-semibold" : linkIdle
      )}
    >
      {nested && !collapsed ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute left-[1.55rem] size-1.5 rounded-full",
            active ? "bg-white" : "bg-sidebar-muted/60 group-hover:bg-primary"
          )}
        />
      ) : (
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center",
            active ? "text-white" : iconIdle
          )}
        >
          <HrisIcon name={item.icon ?? "dashboard"} className="size-[22px]" />
        </span>
      )}
      {collapsed ? (
        count > 0 ? (
          <span className="absolute top-1.5 right-2 size-2.5 rounded-full bg-[#EF4444] ring-2 ring-sidebar" />
        ) : null
      ) : (
        <>
          <span className="min-w-0 flex-1 truncate">{item.title}</span>
          <CountBadge count={count} />
        </>
      )}
    </Link>
  );
}

function NavGroup({
  item,
  activeHref,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  activeHref: string | null;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const children = item.children ?? [];
  const containsActive = children.some((child) => child.href === activeHref);
  const [open, setOpen] = useState(containsActive);
  const expanded = open || containsActive;

  if (collapsed) {
    // Icon rail: the group jumps to its first page.
    return (
      <li>
        <NavLeaf
          item={{ ...item, href: children[0].href }}
          active={containsActive}
          collapsed
          onNavigate={onNavigate}
        />
      </li>
    );
  }

  const panelId = `nav-group-${item.href.replace(/[^a-z0-9]/gi, "")}`;

  return (
    <li>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className={cn(
          linkBase,
          "w-full text-left",
          containsActive ? "font-semibold text-primary" : linkIdle
        )}
      >
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center",
            containsActive ? "text-primary" : iconIdle
          )}
        >
          <HrisIcon name={item.icon ?? "dashboard"} className="size-[22px]" />
        </span>
        <span className="min-w-0 flex-1 truncate">{item.title}</span>
        <HrisIcon
          name="chevron-down"
          className={cn(
            "size-[18px] shrink-0 text-sidebar-muted transition-transform duration-200",
            expanded && "rotate-180"
          )}
        />
      </button>
      {expanded ? (
        <ul id={panelId} className="mt-1 space-y-0.5">
          {children.map((child) => (
            <li key={child.href}>
              <NavLeaf
                item={child}
                active={child.href === activeHref}
                collapsed={false}
                onNavigate={onNavigate}
                nested
              />
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
