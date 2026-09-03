"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Employee route error boundary. Never exposes stack traces or database
 * details; the technical error is logged server-side.
 */
export default function EmployeesError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error("[employees] page error", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-6 py-12 text-center">
      <h2 className="text-sm font-semibold text-foreground">
        Unable to load employees
      </h2>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong while loading this page. Please try again.
      </p>
      <Button type="button" variant="outline" onClick={retry}>
        Try again
      </Button>
    </div>
  );
}
