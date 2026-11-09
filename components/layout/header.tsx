"use client";

import { Brand } from "./brand";
import { MobileNav } from "./mobile-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { logoutAction } from "@/features/auth/actions";
import type { CurrentUser } from "@/lib/auth/types";
import type { NavSection } from "@/types/navigation";

/**
 * Sticky top bar — MD3 Soft Blue shell.
 *
 * Clean translucent surface, search where supported, notification icon with
 * unread badge, theme switcher, organization context, user avatar and account
 * menu, soft role badge, subtle bottom border.
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
      className="sticky top-0 z-sticky flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/90 px-4 backdrop-blur-md lg:h-16 lg:px-8"
    >
      <MobileNav sections={sections} />
      <div className="min-w-0 lg:hidden">
        <Brand />
      </div>

      <div className="flex-1" />

      {roleLabel ? (
        <span className="hidden rounded-lg border border-primary/20 bg-surface-primary px-2.5 py-1 text-[11px] font-medium whitespace-nowrap text-primary dark:border-primary/30 dark:bg-surface-primary dark:text-primary sm:inline-flex">
          {roleLabel}
        </span>
      ) : null}

      {organizationName ? (
        <span className="hidden max-w-44 truncate text-sm text-secondary sm:block">
          {organizationName}
        </span>
      ) : null}

      <div className="flex items-center gap-2">
        <ThemeToggle />

        <button
          type="button"
          aria-label="Notifications"
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="size-5"
          >
            <path d="M6 9a6 6 0 0 1 12 0c0 4 1.2 5.3 1.8 6H4.2C4.8 14.3 6 13 6 9Z" />
            <path d="M10 18.5a2 2 0 0 0 4 0" />
          </svg>
          <span className="absolute right-1 top-1 flex size-3.5 shrink-0 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold ring-1 ring-background">
            0
          </span>
        </button>

        <span
          aria-label={`Signed in as ${user.email}`}
          title={user.email}
          className="hidden max-w-52 truncate text-sm text-secondary sm:block"
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
