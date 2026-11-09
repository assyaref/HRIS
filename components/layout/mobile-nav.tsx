"use client";

import { useEffect, useRef, useState } from "react";
import { createTabTrap, getFocusableElements } from "@/lib/utils/focus";
import type { NavSection } from "@/types/navigation";
import { Brand } from "./brand";
import { NavLinks } from "./nav-links";

/**
 * Mobile navigation: hamburger trigger + accessible slide-over drawer.
 * Navy drawer matching the desktop navigation rail: HRIS branding, solid
 * primary active pill, muted icons, accessible keyboard handling.
 *
 * Rendered as a modal (focus trap, Esc to close, scroll lock).
 * `sections` are permission-filtered server-side before they reach this
 * client component.
 */
export function MobileNav({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const panel = panelRef.current;
    const trapTab = createTabTrap(panel);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        return;
      }
      trapTab(event);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const focusFrame = requestAnimationFrame(() => {
      getFocusableElements(panel)[0]?.focus();
    });

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl text-foreground/80 transition-colors hover:bg-muted hover:text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:hidden"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          aria-hidden="true"
          className="size-5"
        >
          <path d="M3.75 6.75h16.5" />
          <path d="M3.75 12h16.5" />
          <path d="M3.75 17.25h16.5" />
        </svg>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="presentation">
          <div
            aria-hidden="true"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm"
          />
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label="Navigation menu"
            className="hris-sidebar absolute inset-y-0 left-0 flex w-80 max-w-[85%] flex-col shadow-xl"
          >
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-sidebar-border pr-2 pl-5">
              <Brand tone="dark" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex size-9 items-center justify-center rounded-lg text-sidebar-foreground transition-colors hover:bg-sidebar-hover hover:text-sidebar-strong focus-visible:ring-2 focus-visible:ring-white/60 focus-visible:outline-none"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="size-5"
                >
                  <path d="M18 6 6 18" />
                  <path d="m6 6 12 12" />
                </svg>
              </button>
            </div>
            <nav
              aria-label="Main navigation"
              className="flex-1 overflow-y-auto p-3"
            >
              <NavLinks
                variant="dark"
                sections={sections}
                onNavigate={() => setOpen(false)}
              />
            </nav>
            <div className="shrink-0 border-t border-sidebar-border px-6 py-4">
              <p className="text-xs text-sidebar-muted">
                Enterprise HRIS
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
