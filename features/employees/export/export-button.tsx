import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";

/**
 * "Export CSV" entry point. Points at the authenticated export route, which
 * re-checks `employees.view` server-side, resolves the effective organization
 * (`org` is honored only for a SUPERADMIN, after server validation), applies
 * the page's active filters (`q` / `status` / `projectId`) and writes an
 * `employee.exported` audit row.
 */
export function EmployeeExportButton({
  search = "",
  status = "",
  organizationId,
  projectId,
  canExport = true,
}: {
  search?: string;
  status?: string;
  organizationId?: string;
  projectId?: string;
  canExport?: boolean;
}) {
  if (!canExport) return null;
  const searchParams = new URLSearchParams();
  const trimmed = search.trim();
  if (trimmed) searchParams.set("q", trimmed);
  if (status) searchParams.set("status", status);
  if (organizationId) searchParams.set("org", organizationId);
  if (projectId) searchParams.set("projectId", projectId);
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