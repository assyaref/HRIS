import Image from "next/image";
import Link from "next/link";

/**
 * HRIS application brand — MD3 Soft Blue.
 *
 * Presentation only. Does not affect authentication or authorization.
 */
export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Enterprise HRIS home"
      className="group flex min-w-0 items-center gap-3"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-white/60">
        <Image
          src="/brand/hris-logo.png"
          alt="Enterprise HRIS"
          width={40}
          height={40}
          priority
          className="size-10 object-contain p-1"
        />
      </span>

      <span className="min-w-0">
        <span className="block truncate text-sm font-bold tracking-tight text-foreground">
          Enterprise HRIS
        </span>
        <span className="block truncate text-[11px] font-medium text-muted-foreground">
          Human Resources Information System
        </span>
      </span>
    </Link>
  );
}
