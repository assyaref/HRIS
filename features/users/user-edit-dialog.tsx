"use client";

import { useActionState, useState } from "react";

import { notifier } from "@/lib/notifier";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { updateUserAction, type UserActionState } from "./actions";
import type { LinkableEmployeeAccount, UserAccountListItem } from "./queries";
import { UserStatusBadge } from "./status-badge";
import type { RoleOption } from "./user-create-dialog";

const initialState: UserActionState = { status: "idle" };

const selectClasses =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

interface EditUserDialogProps {
  user: UserAccountListItem;
  roles: RoleOption[];
  employees: LinkableEmployeeAccount[];
}

/**
 * "Edit" dialog for one account (client leaf). The server action re-checks
 * `users.update` and the manage-scope policy against the account's real
 * organization. Organization is read-only here — it is immutable after
 * creation because it anchors RBAC grants and audit scope.
 */
export function EditUserDialog({
  user,
  roles,
  employees,
}: EditUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    updateUserAction.bind(null, user.id),
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "User account updated.");
    setOpen(false);
  }

  const nameError = state.fieldErrors?.name;
  const emailError = state.fieldErrors?.email;
  const roleIdError = state.fieldErrors?.roleId;
  const employeeIdError = state.fieldErrors?.employeeId;
  const statusError = state.fieldErrors?.status;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Edit ${user.email}`}
      >
        Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              Update account details for{" "}
              <span className="font-medium text-foreground">
                {user.email}
              </span>
              . The organization cannot be changed.
            </DialogDescription>
          </DialogHeader>

          {state.status === "error" && state.message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </div>
          ) : null}

          <form action={formAction} noValidate className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="edit-user-name">Name</Label>
              <Input
                id="edit-user-name"
                name="name"
                defaultValue={user.name ?? ""}
                placeholder="Full name"
                autoComplete="off"
                invalid={Boolean(nameError)}
                aria-invalid={Boolean(nameError)}
              />
              {nameError ? (
                <p className="text-sm text-destructive">{nameError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-email">Email</Label>
              <Input
                id="edit-user-email"
                name="email"
                type="email"
                defaultValue={user.email}
                required
                invalid={Boolean(emailError)}
                aria-invalid={Boolean(emailError)}
              />
              {emailError ? (
                <p className="text-sm text-destructive">{emailError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-role">Role</Label>
              <select
                id="edit-user-role"
                name="roleId"
                className={selectClasses}
                defaultValue={user.roleId ?? ""}
              >
                <option value="" disabled>
                  Select a role
                </option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              {roleIdError ? (
                <p className="text-sm text-destructive">{roleIdError}</p>
              ) : null}
              {user.roleCode === "SUPERADMIN" ? (
                <p className="text-xs text-muted-foreground">
                  This is a Super Administrator account. The SUPERADMIN role
                  cannot be removed through editing; deactivate the account
                  instead.
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-employee">Employee</Label>
              <select
                id="edit-user-employee"
                name="employeeId"
                className={selectClasses}
                defaultValue={user.employeeId ?? ""}
              >
                <option value="">— Not linked to an employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    [{employee.employeeNumber}] {employee.employeeName}
                  </option>
                ))}
              </select>
              {employeeIdError ? (
                <p className="text-sm text-destructive">{employeeIdError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-user-status">Status</Label>
              <select
                id="edit-user-status"
                name="status"
                className={selectClasses}
                defaultValue={user.status}
              >
                <option value="pending">Invited</option>
                <option value="active">Active</option>
                <option value="suspended">Inactive</option>
                <option value="locked">Locked</option>
              </select>
              {statusError ? (
                <p className="text-sm text-destructive">{statusError}</p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3 rounded-md border border-border bg-muted/40 p-3">
              <div>
                <p className="text-xs text-muted-foreground">Organization</p>
                <p className="text-sm font-medium">{user.organizationCode}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Current status</p>
                <UserStatusBadge status={user.status} />
              </div>
            </div>

            <DialogFooter className="flex gap-2 sm:justify-end">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? "Saving..." : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}