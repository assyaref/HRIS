import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * "Export CSV" entry point. Points at the authenticated export route, which
 * re-checks `employees.view` server-side, streams only the actor's
 * organization rows (mirroring the page's active `q`/`status` filters), and
 * writes an `employee.exported` audit row.
 */
export function EmployeeExportButton({
  search = "",
  status = "",
  canExport = true,
}: {
  search?: string;
  status?: string;
  canExport?: boolean;
}) {
  if (!canExport) return null;
  const searchParams = new URLSearchParams();
  const trimmed = search.trim();
  if (trimmed) searchParams.set("q", trimmed);
  if (status) searchParams.set("status", status);
  const query = searchParams.toString();

  return (
    <Link
      href={query ? `/api/employees/export?${query}` : "/api/employees/export"}
      download
      className={buttonVariants({ variant: "ghost", size: "sm" })}
      aria-label="Export employees as CSV"
    >
      Export CSV
    </Link>
  );
}