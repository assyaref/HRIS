import Link from "next/link";

/** Application wordmark used by the sidebar and mobile navigation. */
export function Brand() {
  return (
    <Link
      href="/"
      aria-label="Enterprise HRIS home"
      className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tracking-tight text-foreground"
    >
      <span
        aria-hidden="true"
        className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
      >
        H
      </span>
      <span className="truncate">Enterprise HRIS</span>
    </Link>
  );
}
