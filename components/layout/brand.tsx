import Image from "next/image";
import Link from "next/link";

/**
 * HRIS application brand.
 *
 * Presentation only.
 * Does not affect authentication or authorization.
 */
export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Enterprise HRIS home"
      className="group flex min-w-0 items-center gap-3"
    >
      <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-slate-200/80">
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
        <span className="block truncate text-sm font-bold tracking-tight text-slate-900">
          Enterprise HRIS
        </span>
        <span className="block truncate text-[11px] font-medium text-slate-500">
          Human Resources Information System
        </span>
      </span>
    </Link>
  );
}
