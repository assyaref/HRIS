"use client";

import Link from "next/link";

import { HrisIcon } from "@/components/layout/icons";
import { useOptionalShell } from "@/components/layout/shell-context";
import { cn } from "@/lib/utils/cn";

/**
 * Raised round "ABSEN" action (face glyph) at the centre of the bottom
 * navigation. Inside the app shell it opens the face-attendance sheet, which
 * submits through the EXISTING check-in / check-out server actions — no new
 * attendance logic lives here. Rendered outside the shell (no context) it
 * degrades to a link into the attendance page. The visible label is
 * screen-reader only to keep the button a clean circle.
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
  const shell = useOptionalShell();
  const classes = cn(
    "hris-fab -mt-9 flex size-[68px] items-center justify-center self-center rounded-full text-white transition-transform focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95",
    active && "brightness-110",
    className
  );

  if (shell) {
    return (
      <button
        type="button"
        aria-label="ABSEN"
        aria-haspopup="dialog"
        aria-expanded={shell.attendanceSheetOpen}
        onClick={shell.openAttendanceSheet}
        className={classes}
      >
        <HrisIcon name="face" className="size-9" />
        <span className="sr-only">ABSEN</span>
      </button>
    );
  }

  return (
    <Link
      href={href}
      aria-label="ABSEN"
      aria-current={active ? "page" : undefined}
      className={classes}
    >
      <HrisIcon name="face" className="size-9" />
      <span className="sr-only">ABSEN</span>
    </Link>
  );
}
