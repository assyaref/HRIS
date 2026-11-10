"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useTheme } from "@/components/theme-provider";
import { logoutAction } from "@/features/auth/actions";
import { cn } from "@/lib/utils/cn";

import { HrisIcon } from "./icons";
import type { ShellProfile } from "./shell-context";

/** Round avatar: profile photo when available, otherwise initials. */
export function Avatar({
  profile,
  size = 44,
  tone = "gradient",
  className,
}: {
  profile: Pick<ShellProfile, "avatarUrl" | "displayName" | "initials">;
  size?: number;
  /** "light" = white disc with blue initials (on blue surfaces). */
  tone?: "gradient" | "light";
  className?: string;
}) {
  return profile.avatarUrl ? (
    <Image
      src={profile.avatarUrl}
      alt={profile.displayName}
      width={size}
      height={size}
      unoptimized
      className={cn("shrink-0 rounded-full object-cover", className)}
      style={{ width: size, height: size }}
    />
  ) : (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-bold select-none",
        tone === "light"
          ? "bg-white text-primary"
          : "bg-gradient-to-br from-[#3B8BFF] to-[#1D5FE6] text-white",
        className
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {profile.initials}
    </span>
  );
}

/**
 * Avatar + chevron in the blue top bar. Opens a menu with identity, account
 * settings, theme switch and sign-out. Closes on outside click and Escape.
 */
export function UserMenu({ profile }: { profile: ShellProfile }) {
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme } = useTheme();

  // The top bar lives in an overflow-hidden band, so the menu is portalled
  // to <body> and pinned under the avatar with fixed positioning.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      setAnchor({
        top: rect.bottom + 10,
        right: Math.max(12, window.innerWidth - rect.right),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dark = theme === "dark";

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Menu akun ${profile.displayName}`}
        className="flex items-center gap-2 rounded-full p-0.5 pr-1 transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
      >
        <Avatar profile={profile} size={44} className="ring-2 ring-white/25" />
        <HrisIcon
          name="chevron-down"
          className={cn(
            "hidden size-5 text-white transition-transform sm:block",
            open && "rotate-180"
          )}
        />
      </button>

      {open && anchor ? createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ top: anchor.top, right: anchor.right }}
          className="fixed z-[70] max-h-[calc(100svh-6rem)] w-64 overflow-y-auto rounded-2xl border border-border bg-card text-foreground shadow-[var(--shadow-xl)]"
        >
          <div className="flex items-center gap-3 border-b border-border px-4 py-3">
            <Avatar profile={profile} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{profile.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{profile.email}</p>
              {profile.roleLabel ? (
                <span className="mt-1 inline-flex rounded-full bg-surface-primary px-2 py-0.5 text-[10px] font-semibold text-primary">
                  {profile.roleLabel}
                </span>
              ) : null}
            </div>
          </div>
          <div className="p-1.5">
            <Link
              role="menuitem"
              href="/settings/account"
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <HrisIcon name="user" className="size-[18px] text-muted-foreground" />
              Profil &amp; Akun
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={() => setTheme(dark ? "light" : "dark")}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-medium hover:bg-muted"
            >
              <HrisIcon
                name={dark ? "sun" : "moon"}
                className="size-[18px] text-muted-foreground"
              />
              {dark ? "Mode terang" : "Mode gelap"}
            </button>
            <form action={logoutAction}>
              <button
                role="menuitem"
                type="submit"
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-danger hover:bg-surface-danger"
              >
                <HrisIcon name="logout" className="size-[18px]" />
                Keluar
              </button>
            </form>
          </div>
        </div>,
        document.body
      ) : null}
    </div>
  );
}
