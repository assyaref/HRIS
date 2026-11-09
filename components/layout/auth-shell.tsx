import type { ReactNode } from "react";

import { Brand } from "./brand";
import { BuildingIllustration } from "./building-illustration";

/**
 * Sign-in shell (HRIS Lite Enterprise v2.0).
 *
 * Desktop: blue brand panel with the office illustration on the left, the
 * form on the right. Mobile: the blue band on top closing with a wave, the
 * form card below.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col bg-background font-sans text-foreground lg:flex-row">
      {/* Brand panel */}
      <section className="hris-band relative isolate overflow-hidden px-6 pt-8 pb-24 lg:flex lg:w-[46%] lg:flex-col lg:px-14 lg:py-12">
        <Brand tone="onBlue" size="lg" />
        <div className="relative z-10 mt-8 max-w-md lg:mt-[12vh]">
          <p className="text-sm font-semibold tracking-[0.12em] text-white/80 uppercase">
            Human Resources Information System
          </p>
          <h1 className="mt-3 text-[28px] leading-tight font-extrabold tracking-tight lg:text-[38px]">
            Kelola karyawan, absensi, cuti & gaji dalam satu tempat.
          </h1>
          <p className="mt-3 text-[15px] text-white/85 lg:text-base">
            Masuk untuk melanjutkan ke dashboard HRIS organisasi Anda.
          </p>
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute right-0 bottom-6 hidden h-[34vh] max-h-[300px] w-full lg:block"
        >
          <BuildingIllustration variant="band" idPrefix="auth" className="size-full" />
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
