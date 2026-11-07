import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/features/auth/actions";
import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";

/**
 * Sticky top bar: mobile menu + brand, live user/role/organization identity,
 * theme switcher and sign-out. Every color is a design-system variable so the
 * bar adapts to light and dark mode without hardcoded palette values.
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
    <header
      className="sticky top-0 z-sticky flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/80 px-4 backdrop-blur-lg lg:h-16 lg:px-8"
    >
      <MobileNav sections={sections} />
      <div className="min-w-0 lg:hidden">
        <Brand />
      </div>

      <div className="flex-1" />

      {roleLabel ? (
        <span className="hidden rounded-full border border-primary/20 bg-primary/10 px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap text-primary sm:inline-flex dark:border-primary/30 dark:bg-primary/5 dark:text-primary">
          {roleLabel}
        </span>
      ) : null}

      {organizationName ? (
        <span className="hidden max-w-44 truncate text-sm text-muted-foreground md:block">
          {organizationName}
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <ThemeToggle />

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
