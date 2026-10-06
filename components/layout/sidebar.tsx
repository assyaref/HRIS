import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export interface SidebarUserInfo {
  user: CurrentUser;
  organizationName: string | null;
  roleLabel: string | null;
}

/** Desktop/tablet sidebar. Hidden below the `lg` breakpoint. */
export function Sidebar({
  sections,
  user,
  organizationName,
  roleLabel,
}: {
  sections: NavSection[];
} & SidebarUserInfo) {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-white/60 backdrop-blur lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-5">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4">
        <NavLinks sections={sections} />
      </div>
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground select-none">
            {user.email.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {user.email}
            </p>
            <p className="truncate text-xs text-slate-500">
              {roleLabel ?? "Team member"}
              {organizationName ? ` · ${organizationName}` : ""}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}