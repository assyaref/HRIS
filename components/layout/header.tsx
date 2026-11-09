"use client";

import { Brand } from "./brand";
import { HrisIcon } from "./icons";
import { MobileNav } from "./mobile-nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/features/auth/actions";
import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";

/**
 * Sticky top bar — clean white surface with hairline bottom border.
 *
 * Organization context chip, theme switcher, notification icon, user avatar
 * with identity + role, and sign-out. Brand + drawer trigger below `lg`.
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/90 px-4 backdrop-blur-md lg:h-16 lg:px-8">
      <MobileNav sections={sections} />
      <div className="min-w-0 lg:hidden">
        <Brand wordmark="sm" />
      </div>

      {organizationName ? (
        <span className="hidden min-w-0 items-center gap-2 rounded-xl border border-border bg-background px-3 py-1.5 text-sm text-muted-foreground lg:inline-flex">
          <HrisIcon name="building" className="size-4 shrink-0 text-primary" />
          <span className="max-w-56 truncate font-medium text-foreground">
            {organizationName}
          </span>
        </span>
      ) : null}

      <div className="flex-1" />

      <div className="flex items-center gap-1">
        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HrisIcon name="bell" className="size-5" />
        </button>
      </div>

      <span aria-hidden="true" className="mx-1 hidden h-8 w-px bg-border sm:block" />

      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-label={`Signed in as ${user.email}`}
          title={user.email}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground select-none ring-2 ring-surface-primary"
        >
          {user.email.charAt(0).toUpperCase()}
        </span>
        <div className="hidden min-w-0 leading-tight md:block">
          <p className="max-w-48 truncate text-sm font-semibold text-foreground" title={user.email}>
            {user.email}
          </p>
          {roleLabel ? (
            <p className="truncate text-xs text-muted-foreground">{roleLabel}</p>
          ) : null}
        </div>
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          aria-label="Sign out"
          title="Sign out"
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-surface-danger hover:text-danger focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <HrisIcon name="logout" className="size-[18px]" />
          <span className="hidden xl:inline">Sign out</span>
        </button>
      </form>
    </header>
  );
}
