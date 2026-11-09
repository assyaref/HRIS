import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

export interface SidebarUserInfo {
  user: CurrentUser;
  organizationName: string | null;
  roleLabel: string | null;
}

/** Desktop/tablet sidebar. Hidden below the `lg` breakpoint.
 *
 * MD3 Soft Blue shell: light pastel-blue surface, soft blue logo area,
 * muted blue-gray navigation text, rounded active indicator, soft
 * lavender/blue active container, gentle hover background, user profile
 * at the bottom.
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
    <aside
      className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-card text-foreground lg:flex"
    >
      <div className="flex h-12 shrink-0 items-center px-4">
        <Brand />
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-2">
        <NavLinks sections={sections} variant="light" />
      </div>
      <div className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-soft-blue text-primary text-xs font-semibold select-none ring-1 ring-primary/20">
            {user.email.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {user.email}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {roleLabel ?? "Team member"}
              {organizationName ? ` · ${organizationName}` : ""}
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
}
