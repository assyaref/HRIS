"use client";

import type { ReactNode } from "react";

import { AttendanceSheet } from "@/features/attendance/attendance-sheet";
import { cn } from "@/lib/utils/cn";
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
 * by the server layout. The face-attendance sheet is mounted once here so the
 * ABSEN button and the home "Absen Sekarang" card open the same flow.
 * Children are server-rendered pages.
 */
export function AppShell({
  sections,
  profile,
  notificationCount,
  bottomNav,
  employeeFrame = false,
  children,
}: {
  sections: NavSection[];
  profile: ShellProfile;
  notificationCount: number;
  bottomNav: ReactNode;
  /**
   * Self-service accounts: no sidebar, and the whole app is one phone-width
   * column centred on wide screens (`.emp-frame`, see globals.css). Purely
   * presentational — route guards stay server-side.
   */
  employeeFrame?: boolean;
  children: ReactNode;
}) {
  return (
    <ShellProvider
      sections={sections}
      profile={profile}
      notificationCount={notificationCount}
    >
      <div
        className={cn(
          "flex min-h-svh bg-background font-sans text-foreground",
          employeeFrame && "emp-frame"
        )}
      >
        {employeeFrame ? null : <Sidebar />}
        <div className="flex min-w-0 flex-1 flex-col">
          <HeroBand />
          <main className="hris-main mx-auto w-full max-w-[1400px] flex-1 px-4 pt-2 pb-32 sm:px-6 lg:px-10 lg:pt-1 lg:pb-10">
            {children}
          </main>
        </div>
      </div>
      <AppDrawer />
      {bottomNav}
      <AttendanceSheet />
      <CommandPalette />
    </ShellProvider>
  );
}
