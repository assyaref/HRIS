import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";

/**
 * Sticky top bar: mobile menu + brand, live user/role/organization identity
 * and sign-out. Kept intentionally clean — notifications belong in a real
 * notification system, which this deployment does not expose yet.
 */
export function Header({
  user,
  sections,
  organizationName,
  roleLabel,
}: {
  user: CurrentUser;
  sections: NavSection[];
  organizationName?: string | null;
  roleLabel?: string | null;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:h-16 lg:px-6">
      <MobileNav sections={sections} />
      <div className="min-w-0 lg:hidden">
        <Brand />
      </div>

      <div className="flex-1" />

      {roleLabel ? (
        <span className="hidden rounded-full border border-blue-100 bg-blue-50/80 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-blue-700 sm:inline-flex">
          {roleLabel}
        </span>
      ) : null}

      {organizationName ? (
        <span className="hidden max-w-44 truncate text-sm text-slate-500 md:block">
          {organizationName}
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <span
          aria-label={`Signed in as ${user.email}`}
          title={user.email}
          className="hidden max-w-52 truncate text-sm text-muted-foreground sm:block"
        >
          {user.email}
        </span>
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground select-none">
          {user.email.charAt(0).toUpperCase()}
        </span>
      </div>

      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
          Sign out
        </Button>
      </form>
    </header>
  );
}