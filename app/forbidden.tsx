import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * Global 403 page (rendered when `forbidden()` is raised by RBAC guards).
 * Deliberately minimal and free of technical details — no database, no stack,
 * no role/permission specifics are exposed here.
 */
export default function ForbiddenPage() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center bg-background px-4 py-12 font-sans text-foreground">
      <div className="flex max-w-md flex-col items-center text-center">
        <span
          aria-hidden="true"
          className="flex size-12 items-center justify-center rounded-full bg-destructive/10 text-sm font-bold text-destructive"
        >
          403
        </span>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight">
          Access denied
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You do not have permission to view this page. If you believe this is
          a mistake, contact your administrator.
        </p>
        <Link href="/dashboard" className={buttonVariants({ className: "mt-6" })}>
          Return to dashboard
        </Link>
      </div>
    </main>
  );
}
