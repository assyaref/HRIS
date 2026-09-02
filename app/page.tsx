import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

/**
 * Root entry point for the future HRIS.
 * Renders a neutral landing page until authentication (Phase 3) provides a
 * proper auth-aware entry/redirect.
 */
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-6 py-24">
      <div className="mx-auto flex w-full max-w-2xl flex-col items-center text-center">
        <Badge variant="outline">Phase 1 · Project Foundation</Badge>
        <h1 className="mt-6 text-4xl font-semibold tracking-tight sm:text-5xl">
          Enterprise HRIS
        </h1>
        <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
          A modern, secure human resource information system for employee
          records, attendance, leave, and payroll — delivered in incremental
          phases.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link href="/dashboard" className={buttonVariants({ size: "lg" })}>
            Open workspace
          </Link>
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          Authentication and HRIS modules arrive in later phases.
        </p>
      </div>
    </main>
  );
}
