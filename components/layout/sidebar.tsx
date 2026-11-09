import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export interface SidebarUserInfo {
  user: CurrentUser;
  organizationName: string | null;
  roleLabel: string | null;
}

/** Desktop sidebar. Hidden below the `lg` breakpoint.
 *
 * Deep navy navigation rail: white wordmark, muted blue-gray links, solid
 * primary pill for the active route, and the signed-in user's profile panel
 * pinned to the bottom.
 */
export function Sidebar({
  sections,
  user,
  organizationName,
  roleLabel,
}: {
  sections: NavSection[];
} & SidebarUserInfo) {
  return (
    <aside className="hris-sidebar sticky top-0 hidden h-svh w-64 shrink-0 flex-col lg:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Brand tone="dark" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-3 [scrollbar-color:rgb(255_255_255/0.18)_transparent]">
        <NavLinks sections={sections} variant="dark" />
      </div>
      <div className="shrink-0 p-3">
        <div className="flex items-center gap-3 rounded-2xl bg-sidebar-panel p-3 ring-1 ring-sidebar-border">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-sidebar-active text-sm font-semibold text-white select-none ring-2 ring-white/15">
            {user.email.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-sidebar-strong" title={user.email}>
              {user.email}
            </p>
            <p className="truncate text-xs text-sidebar-muted">
              {roleLabel ?? "Team member"}
              {organizationName ? ` · ${organizationName}` : ""}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
