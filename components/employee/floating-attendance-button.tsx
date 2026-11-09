"use client";

import Link from "next/link";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

/**
 * Raised round "ABSEN" action (scan glyph) at the centre of the bottom
 * navigation. Links into the EXISTING attendance flow — no new check-in
 * logic is introduced here. The visible label is screen-reader only to keep
 * the button a clean circle, as in the HRIS Lite v2 design.
 */
export function FloatingAttendanceButton({
  href = "/attendance",
  active = false,
  className,
}: {
  href?: string;
  active?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label="ABSEN"
      aria-current={active ? "page" : undefined}
      className={cn(
        "hris-fab -mt-9 flex size-[68px] items-center justify-center self-center rounded-full text-white transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95",
        active && "brightness-110",
        className
      )}
    >
      <HrisIcon name="qr-scan" className="size-8" />
      <span className="sr-only">ABSEN</span>
    </Link>
  );
}
