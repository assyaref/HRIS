import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

/** Desktop/tablet sidebar. Hidden below the `lg` breakpoint. */
export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-svh w-64 shrink-0 flex-col border-r border-border bg-background lg:flex">
      <div className="flex h-16 shrink-0 items-center border-b border-border px-6">
        <Brand />
      </div>
      <nav aria-label="Main navigation" className="flex-1 overflow-y-auto p-3">
        <NavLinks />
      </nav>
      <div className="shrink-0 border-t border-border px-6 py-4">
        <p className="text-xs text-muted-foreground">Phase 3 — Authentication</p>
      </div>
    </aside>
  );
}
