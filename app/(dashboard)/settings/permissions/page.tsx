import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import {
  PERMISSION_MODULE_LABELS,
  PERMISSIONS,
  splitPermissionCode,
} from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import { listPermissionCatalog } from "@/features/rbac/queries";

export const metadata: Metadata = {
  title: "Permissions",
};

/**
 * Permission catalog (Phase 4 RBAC UI).
 *
 * Read-only listing of every capability in the system. The catalog is the
 * shared vocabulary that roles reference; it changes only through code +
 * seed, never through this page.
 */
export default async function PermissionsPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.PERMISSIONS_VIEW);

  const rows = await listPermissionCatalog();

  const modules = new Set(rows.map((row) => row.module));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Permissions
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {rows.length} capabilities across {modules.size} modules. Permissions
          are assigned to roles, never directly to users.
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="Permission catalog is empty"
          description="Run the RBAC seed (`npm run db:seed:rbac`) to populate the permission catalog."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Module</TableHead>
                <TableHead>Description</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const { resource, action } = splitPermissionCode(row.code);
                return (
                  <TableRow key={row.id}>
                    <TableCell className="font-mono text-xs font-medium">
                      {row.code}
                    </TableCell>
                    <TableCell>{resource}</TableCell>
                    <TableCell>{action}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {PERMISSION_MODULE_LABELS[row.module as keyof typeof PERMISSION_MODULE_LABELS] ??
                          row.module}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.description ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
