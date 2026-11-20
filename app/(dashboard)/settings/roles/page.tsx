import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
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
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { listRolesByOrganization } from "@/features/rbac/queries";
import { CreateRoleDialog } from "@/features/rbac/role-create-dialog";

export const metadata: Metadata = {
  title: "Peran",
};

/**
 * Role administration list (Phase 4 RBAC UI).
 *
 * Only roles belonging to the caller's own organization are listed. The
 * page-level guard runs server-side; the "New role" dialog still submits to
 * a server action that re-checks `roles.create`.
 */
export default async function RolesPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ROLES_VIEW);

  const canCreate = await hasPermission(user.id, PERMISSIONS.ROLES_CREATE);

  const roles = user.organizationId
    ? await listRolesByOrganization(user.organizationId)
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Peran
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Peran menentukan apa saja yang boleh dilakukan pengguna di organisasi ini.
          </p>
        </div>
        {canCreate ? <CreateRoleDialog /> : null}
      </div>

      {!user.organizationId ? (
        <EmptyState
          title="Belum ada organisasi"
          description="Akun Anda belum tertaut ke organisasi, sehingga tidak ada peran untuk dikelola."
        />
      ) : roles.length === 0 ? (
        <EmptyState
          title="Belum ada peran"
          description="Jalankan seed RBAC (`npm run db:seed:rbac`) untuk membuat katalog peran sistem, lalu sesuaikan dari sini."
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Peran</TableHead>
                <TableHead>Kode</TableHead>
                <TableHead>Jenis</TableHead>
                <TableHead className="text-right">Hak akses</TableHead>
                <TableHead className="text-right">Pengguna</TableHead>
                <TableHead className="text-right">Aksi</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {roles.map((role) => (
                <TableRow key={role.id}>
                  <TableCell className="font-medium">
                    {role.name}
                    <span className="block text-xs font-normal text-muted-foreground">
                      {role.description || "Tanpa deskripsi"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{role.code}</Badge>
                  </TableCell>
                  <TableCell>
                    {role.isSystem ? (
                      <Badge variant="secondary">Sistem</Badge>
                    ) : (
                      <Badge variant="primary">Kustom</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {role.permissionCount}
                  </TableCell>
                  <TableCell className="text-right">
                    {role.memberCount}
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/settings/roles/${role.id}`}
                      className={buttonVariants({
                        variant: "ghost",
                        size: "sm",
                      })}
                    >
                      Lihat peran
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
