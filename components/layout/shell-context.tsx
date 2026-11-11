"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { NavSection } from "@/types/navigation";

import { flattenNavHrefs } from "./navigation";

/** An organization a Super Administrator may switch into. */
export interface ShellOrganizationOption {
  id: string;
  name: string;
  code: string;
  isSystem: boolean;
  logoUrl?: string | null;
}

/** Who is signed in, as shown by the shell (sidebar, top bar, hero, drawer). */
export interface ShellProfile {
  displayName: string;
  email: string;
  initials: string;
  employeeNumber: string | null;
  roleLabel: string | null;
  avatarUrl: string | null;
  organizationName: string | null;
  /** Authenticated URL of the organization's custom logo, when one is set. */
  organizationLogoUrl?: string | null;
  /** "Selamat Pagi" … computed server-side in the app time zone. */
  greeting: string;
  isSuperAdmin: boolean;
  /** The organization this session operates in (acting org for SUPERADMIN). */
  activeOrganizationId?: string | null;
  /** Super Administrator only: organizations available in the switcher. */
  organizationOptions?: ShellOrganizationOption[];
}

interface ShellContextValue {
  sections: NavSection[];
  /** Every authorized, linkable href (groups flattened). */
  hrefs: string[];
  profile: ShellProfile;
  notificationCount: number;
  collapsed: boolean;
  toggleCollapsed: () => void;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

const COLLAPSE_KEY = "hris-sidebar-collapsed";

/**
 * Client state for the authenticated shell: sidebar collapse (persisted per
 * browser), mobile drawer and the search palette. Navigation data arrives
 * already permission-filtered from the server layout.
 */
export function ShellProvider({
  sections,
  profile,
  notificationCount,
  children,
}: {
  sections: NavSection[];
  profile: ShellProfile;
  notificationCount: number;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Restore the persisted collapse preference after hydration (the server
  // always renders the expanded rail, so the first paint matches).
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") {
        const frame = requestAnimationFrame(() => setCollapsed(true));
        return () => cancelAnimationFrame(frame);
      }
    } catch {
      // Storage can be unavailable (private mode); keep the default.
    }
    return undefined;
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // Ignore storage failures; the toggle still works for this visit.
      }
      return next;
    });
  }, []);

  const hrefs = useMemo(() => flattenNavHrefs(sections), [sections]);

  const value = useMemo<ShellContextValue>(
    () => ({
      sections,
      hrefs,
      profile,
      notificationCount,
      collapsed,
      toggleCollapsed,
      drawerOpen,
      setDrawerOpen,
      paletteOpen,
      setPaletteOpen,
    }),
    [
      sections,
      hrefs,
      profile,
      notificationCount,
      collapsed,
      toggleCollapsed,
      drawerOpen,
      paletteOpen,
    ]
  );

  return <ShellContext.Provider value={value}>{children}</ShellContext.Provider>;
}

export function useShell(): ShellContextValue {
  const value = useContext(ShellContext);
  if (!value) {
    throw new Error("useShell must be used inside <ShellProvider>");
  }
  return value;
}

/** Same as useShell but tolerant of being rendered outside the shell. */
export function useOptionalShell(): ShellContextValue | null {
  return useContext(ShellContext);
}
