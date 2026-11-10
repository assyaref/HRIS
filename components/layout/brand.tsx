import Image from "next/image";
import Link from "next/link";

import logoFull from "@/assets/brand/hris-logo-full.png";
import logoMark from "@/assets/brand/hris-logo-mark.png";
import { cn } from "@/lib/utils/cn";

/**
 * HRIS brand lockup: hexagon mark + "HRIS" wordmark + "Human Resource
 * Information System". The artwork is navy on transparent, so it is always
 * placed on white. Imported statically so it ships inside `.next`.
 */
export function BrandLogo({
  height,
  priority,
  className,
}: {
  height: number;
  priority?: boolean;
  className?: string;
}) {
  const width = Math.round((height * logoFull.width) / logoFull.height);
  return (
    <Image
      src={logoFull}
      alt="HRIS — Human Resource Information System"
      width={width}
      height={height}
      priority={priority}
      className={cn("block max-w-full object-contain", className)}
      style={{ width, height: "auto" }}
    />
  );
}

/** The hexagon mark alone, for tight spots (collapsed rail, mobile bar). */
export function BrandMark({
  size,
  priority,
  className,
}: {
  size: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <Image
      src={logoMark}
      alt=""
      width={size}
      height={size}
      priority={priority}
      className={cn("block object-contain", className)}
      style={{ width: size, height: size }}
    />
  );
}

/**
 * Sign-in brand: the logo on a white plate, with the edition line and the
 * logo's three-pill accent. `tone="onBlue"` for the blue band.
 */
export function Brand({
  tone = "light",
  size = "md",
}: {
  tone?: "light" | "onBlue";
  size?: "md" | "lg";
}) {
  const onBlue = tone === "onBlue";
  return (
    <Link
      href="/"
      aria-label="HRIS Lite Enterprise"
      className="group inline-flex max-w-full min-w-0 flex-col items-start gap-3 rounded-2xl focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      <span
        className={cn(
          "hris-logo-plate inline-flex max-w-full rounded-2xl",
          size === "lg" ? "px-5 py-3.5" : "px-4 py-3",
          onBlue
            ? "shadow-[0_18px_40px_-18px_rgb(0_0_0/0.55)]"
            : "ring-1 ring-border shadow-sm"
        )}
      >
        <BrandLogo height={size === "lg" ? 76 : 52} priority />
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-2.5 text-[13px] font-semibold tracking-wide",
          onBlue ? "text-white/90" : "text-muted-foreground"
        )}
      >
        <span className="hris-brand-pills" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        Lite Enterprise v2.0
      </span>
    </Link>
  );
}
