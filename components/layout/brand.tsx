import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils/cn";

/**
 * HRIS application brand.
 *
 * `tone="dark"` renders on the navy navigation rail (white wordmark);
 * the default renders on light surfaces (header, auth pages).
 * `wordmark="sm"` keeps only the logo mark on narrow headers.
 * Presentation only. Does not affect authentication or authorization.
 */
export function Brand({
  tone = "light",
  wordmark = "always",
}: {
  tone?: "light" | "dark";
  /** "sm" hides the wordmark below the `sm` breakpoint (logo mark only). */
  wordmark?: "always" | "sm";
}) {
  const onDark = tone === "dark";
  return (
    <Link
      href="/"
      aria-label="Enterprise HRIS home"
      className="group flex min-w-0 items-center gap-3 rounded-xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn(
          "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl",
          onDark
            ? "bg-white/10 ring-1 ring-white/15"
            : "bg-primary text-primary-foreground shadow-[var(--shadow-primary)]"
        )}
      >
        <Image
          src="/brand/hris-logo.png"
          alt="Enterprise HRIS"
          width={40}
          height={40}
          priority
          className="size-10 object-contain p-1"
        />
      </span>

      <span className={cn("min-w-0", wordmark === "sm" && "hidden sm:block")}>
        <span
          className={cn(
            "block truncate text-[15px] font-bold tracking-tight",
            onDark ? "text-sidebar-strong" : "text-foreground"
          )}
        >
          Enterprise HRIS
        </span>
        <span
          className={cn(
            "block truncate text-[11px] font-medium",
            onDark ? "text-sidebar-muted" : "text-muted-foreground"
          )}
        >
          Human Resources Information System
        </span>
      </span>
    </Link>
  );
}
