import type { ReactNode } from "react";

import { Brand } from "./brand";
import { HeroWidgets } from "./hero-widgets";

/**
 * Sign-in shell.
 *
 * Desktop: blue brand panel (logo + clock / weather / prayer schedule) on the
 * left, the form on the right. Mobile: the blue band on top closing with a
 * wave, the form card below. The widgets never prompt for the device position
 * here — they reuse the position this browser already shared, or Jakarta.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-background font-sans text-foreground lg:flex-row">
      {/* Brand panel */}
      <section className="hris-band relative isolate overflow-hidden px-6 pt-8 pb-24 lg:flex lg:w-[46%] lg:flex-col lg:px-14 lg:py-12">
        <Brand tone="onBlue" size="lg" />
        <div className="mt-10 hidden lg:mt-auto lg:block">
          <HeroWidgets geolocate={false} className="lg:grid-cols-1 xl:grid-cols-3" />
        </div>
        <svg
          aria-hidden="true"
          viewBox="0 0 1440 64"
          preserveAspectRatio="none"
          className="hris-wave absolute inset-x-0 -bottom-px h-10 lg:hidden"
        >
          <path d="M0 46C180 18 360 6 560 22s420 44 640 30c120-8 190-26 240-40v52H0z" fill="currentColor" />
        </svg>
      </section>

      {/* Form */}
      <section className="relative -mt-14 flex flex-1 items-start justify-center px-4 pb-12 lg:mt-0 lg:items-center lg:px-10">
        <div className="w-full max-w-md">{children}</div>
      </section>
    </main>
  );
}
