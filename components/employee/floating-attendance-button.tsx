"use client";

import Link from "next/link";

import { HrisIcon } from "@/components/layout/icons";
import { cn } from "@/lib/utils/cn";

/**
 * Elevated "ABSEN" action with the Face Scan icon. It is the centre element
 * of the employee bottom navigation (mobile) and links into the EXISTING
 * attendance flow — no new check-in logic is introduced here.
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
      className={cn(
        "emp-gradient -mt-7 flex size-16 flex-col items-center justify-center gap-0.5 self-center rounded-full border-4 border-white text-white shadow-[0_14px_30px_-10px_rgba(22,119,232,0.85)] ring-1 ring-cyan-200/80 transition-transform focus-visible:ring-2 focus-visible:ring-[#1677e8] focus-visible:ring-offset-2 focus-visible:outline-none active:scale-95",
        active && "ring-2 ring-cyan-300",
        className
      )}
    >
      <HrisIcon name="face" className="size-7" />
      <span className="text-[10px] font-semibold tracking-wide">ABSEN</span>
    </Link>
  );
}
