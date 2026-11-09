import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * HRIS Lite Enterprise v2.0 wordmark: round white logo disc, "HRIS" and the
 * edition line. `tone="onBlue"` for the blue band, `tone="light"` for white
 * surfaces. Presentation only.
 */
export function Brand({
  tone = "light",
  size = "md",
}: {
  tone?: "light" | "onBlue";
  size?: "md" | "lg";
}) {
  const onBlue = tone === "onBlue";
  const disc = size === "lg" ? 60 : 48;
  return (
    <Link
      href="/"
      aria-label="HRIS Lite Enterprise"
      className="group flex min-w-0 items-center gap-3 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-white",
          onBlue ? "shadow-[0_8px_18px_-10px_rgb(0_0_0/0.45)]" : "ring-1 ring-border shadow-sm"
        )}
        style={{ width: disc, height: disc }}
      >
        <Image
          src="/brand/hris-logo.png"
          alt=""
          width={disc}
          height={disc}
          priority
          className="object-contain p-1.5"
          style={{ width: disc, height: disc }}
        />
      </span>
      <span className="min-w-0 leading-tight">
        <span
          className={cn(
            "block font-extrabold tracking-tight",
            size === "lg" ? "text-[26px]" : "text-[22px]",
            onBlue ? "text-white" : "text-foreground"
          )}
        >
          HRIS
        </span>
        <span
          className={cn(
            "block truncate text-[13px] font-medium",
            onBlue ? "text-white/85" : "text-muted-foreground"
          )}
        >
          Lite Enterprise v2.0
        </span>
      </span>
    </Link>
  );
}
