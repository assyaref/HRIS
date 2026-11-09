"use client";

import type { ReactNode } from "react";

import type { NavSection } from "@/types/navigation";

import { AppDrawer } from "./app-drawer";
import { CommandPalette } from "./command-palette";
import { HeroBand } from "./hero-band";
import { ShellProvider, type ShellProfile } from "./shell-context";
import { Sidebar } from "./sidebar";

/**
 * Authenticated application shell (HRIS Lite Enterprise v2.0).
 *
 * Desktop: white sidebar + blue header band (greeting hero on Beranda).
 * Mobile: the same band with a drawer, and the bottom navigation passed in
 * by the server layout. Children are server-rendered pages.
 */
export function AppShell({
  sections,
  profile,
  notificationCount,
  bottomNav,
  children,
}: {
  sections: NavSection[];
  profile: ShellProfile;
  notificationCount: number;
  bottomNav: ReactNode;
  children: ReactNode;
}) {
  return (
    <ShellProvider
      sections={sections}
      profile={profile}
      notificationCount={notificationCount}
    >
      <div className="flex min-h-svh bg-background font-sans text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <HeroBand />
          <main className="hris-main mx-auto w-full max-w-[1400px] flex-1 px-4 pt-2 pb-32 sm:px-6 lg:px-10 lg:pt-1 lg:pb-10">
            {children}
          </main>
        </div>
      </div>
      <AppDrawer />
      {bottomNav}
      <CommandPalette />
    </ShellProvider>
  );
}
