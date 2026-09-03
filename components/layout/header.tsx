import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";
import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";

/**
 * Sticky top bar: mobile menu + brand, with the signed-in user and sign-out.
 */
export function Header({
  user,
  sections,
}: {
  user: CurrentUser;
  sections: NavSection[];
}) {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur lg:h-16 lg:px-6">
      <MobileNav sections={sections} />
      <div className="min-w-0 lg:hidden">
        <Brand />
      </div>
      <div className="flex-1" />
      <span
        aria-label={`Signed in as ${user.email}`}
        title={user.email}
        className="hidden max-w-56 truncate text-sm text-muted-foreground sm:block"
      >
        {user.email}
      </span>
      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground select-none sm:hidden">
        {user.email.charAt(0).toUpperCase()}
      </div>
      <form action={logoutAction}>
        <Button type="submit" variant="ghost" size="sm" aria-label="Sign out">
          Sign out
        </Button>
      </form>
    </header>
  );
}

