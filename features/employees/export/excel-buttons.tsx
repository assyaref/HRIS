"use client";

import { HrisIcon } from "@/components/layout/icons";
import { buttonVariants } from "@/components/ui/button";

/**
 * "Export Excel" for the employee list.
 *
 * Links straight at the authenticated export route, which re-checks RBAC
 * server-side, resolves the effective organization (`org` is honored only for
 * a SUPERADMIN), applies the page's filters (`q` / `status` / `projectId`) and
 * masks sensitive columns per role. The import template lives inside the
 * Import dialog.
 */
export function EmployeeExcelButtons({
  search = "",
  status = "",
  organizationId,
  projectId,
  canExport = false,
}: {
  search?: string;
  status?: string;
  organizationId?: string;
  projectId?: string;
  canExport?: boolean;
}) {
  if (!canExport) return null;

  const params = new URLSearchParams();
  if (organizationId) params.set("org", organizationId);
  if (projectId) params.set("projectId", projectId);
  if (search.trim()) params.set("q", search.trim());
  if (status) params.set("status", status);
  params.set("format", "excel");

  return (
    <a
      href={`/api/employees/export?${params.toString()}`}
      className={buttonVariants({ variant: "outline" })}
      aria-label="Export employees to Excel"
    >
      <HrisIcon name="download" className="size-4" />
      Export Excel
    </a>
  );
}
