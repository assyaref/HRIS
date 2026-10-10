"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

import type { LinkableEmployeeAccount, UserAccountListItem } from "./queries";
import { UserStatusBadge } from "./status-badge";
import { EditUserDialog } from "./user-edit-dialog";
import { DeleteUserDialog } from "./user-delete-dialog";
import { ResetPasswordDialog } from "./user-reset-password-dialog";
import type { RoleOption } from "./user-create-dialog";

function formatDate(value: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(value)
    .replace(/\//g, "-");
}

interface UsersManagerProps {
  users: UserAccountListItem[];
  roles: RoleOption[];
  employees: LinkableEmployeeAccount[];
  canUpdate: boolean;
  canReset: boolean;
  /** Per-account delete eligibility (independent of the server's re-check). */
  canDeleteMap: Record<string, boolean>;
  actorIsSuperAdmin: boolean;
}

/**
 * Org-scoped user account list (desktop table + mobile cards). Edit/Delete
 * open dialogs; every mutation is re-checked by the server actions. Delete is
 * hidden when the deletion policy can already rule it out (self, last active
 * Super Administrator, protected history).
 */
export function UsersManager({
  users,
  roles,
  employees,
  canUpdate,
  canReset,
  canDeleteMap,
  actorIsSuperAdmin,
}: UsersManagerProps) {
  if (users.length === 0) {
    return (
      <EmptyState
        title="No user accounts yet"
        description="Add a user account to grant dashboard access. Each account carries a role, an organization scope and an optional employee link."
      />
    );
  }

  return (
    <>
      <div className="hidden rounded-lg border border-border bg-card sm:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>User</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Role</TableHead>
              {actorIsSuperAdmin ? <TableHead>Organization</TableHead> : null}
              <TableHead>Employee</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Last Login</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((user) => (
              <TableRow key={user.id}>
                <TableCell className="font-medium">
                  {user.name ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.email}
                </TableCell>
                <TableCell>
                  {user.roleName ? (
                    <Badge variant="outline">{user.roleName}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                {actorIsSuperAdmin ? (
                  <TableCell className="text-muted-foreground">
                    {user.organizationCode}
                  </TableCell>
                ) : null}
                <TableCell className="text-muted-foreground">
                  {user.employeeName ?? "—"}
                </TableCell>
                <TableCell>
                  <UserStatusBadge status={user.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(user.createdAt)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    {canUpdate ? (
                      <EditUserDialog user={user} roles={roles} employees={employees} />
                    ) : null}
                    {canReset ? (
                      <ResetPasswordDialog
                        user={{
                          id: user.id,
                          name: user.name,
                          email: user.email,
                          employeeNumber: user.employeeNumber,
                          employeeName: user.employeeName,
                        }}
                      />
                    ) : null}
                    {canDeleteMap[user.id] ? <DeleteUserDialog user={user} /> : null}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="space-y-3 sm:hidden">
        {users.map((user) => (
          <div
            key={user.id}
            className="rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate font-medium">{user.name ?? "—"}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {user.email}
                </p>
              </div>
              <UserStatusBadge status={user.status} />
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Role</dt>
                <dd className="truncate">{user.roleName ?? "—"}</dd>
              </div>
              {actorIsSuperAdmin ? (
                <div>
                  <dt className="text-xs text-muted-foreground">Org</dt>
                  <dd className="truncate">{user.organizationCode}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs text-muted-foreground">Employee</dt>
                <dd className="truncate">
                  {user.employeeName ?? `#${user.employeeNumber ?? "—"}`}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Last Login</dt>
                <dd>{user.lastLoginAt ? formatDate(user.lastLoginAt) : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Created</dt>
                <dd>{formatDate(user.createdAt)}</dd>
              </div>
            </dl>
            <div className="mt-3 flex justify-end gap-1">
              {canUpdate ? (
                <EditUserDialog user={user} roles={roles} employees={employees} />
              ) : null}
              {canReset ? (
                <ResetPasswordDialog
                  user={{
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    employeeNumber: user.employeeNumber,
                    employeeName: user.employeeName,
                  }}
                />
              ) : null}
              {canDeleteMap[user.id] ? <DeleteUserDialog user={user} /> : null}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}