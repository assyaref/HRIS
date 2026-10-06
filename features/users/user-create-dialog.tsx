"use client";

import { useState, useActionState } from "react";

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

import {
  createUserAction,
  type UserActionState,
} from "./actions";
import type { LinkableEmployeeAccount } from "./queries";

export interface RoleOption {
  id: string;
  code: string;
  name: string;
}

const initialState: UserActionState = { status: "idle" };

const selectClasses =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

interface CreateUserDialogProps {
  organizationId: string;
  roles: RoleOption[];
  employees: LinkableEmployeeAccount[];
  isSuperAdmin: boolean;
}

/**
 * "Add User" dialog (client leaf). Creation runs in `createUserAction`, which
 * re-authenticates, re-checks `users.create`, resolves the target organization
 * server-side and enforces the manage-scope policy for SUPERADMIN/tenant
 * boundaries. The Organization select is intentionally not exposed here — the
 * page-level organization selector (SUPERADMIN only) drives it.
 */
export function CreateUserDialog({
  organizationId,
  roles,
  employees,
  isSuperAdmin,
}: CreateUserDialogProps) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState("pending");
  const [state, formAction, isPending] = useActionState(
    createUserAction,
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "User account created.");
    setOpen(false);
  }

  const nameError = state.fieldErrors?.name;
  const emailError = state.fieldErrors?.email;
  const roleIdError = state.fieldErrors?.roleId;
  const employeeIdError = state.fieldErrors?.employeeId;
  const statusError = state.fieldErrors?.status;
  const passwordError = state.fieldErrors?.password;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add User
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add User</DialogTitle>
            <DialogDescription>
              Create a new HRIS user account. Email addresses must be unique
              system-wide; role and linked employee scoped to the current
              organization.
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
            <input type="hidden" name="organizationId" value={organizationId} />

            <div className="space-y-2">
              <Label htmlFor="create-user-name">Name</Label>
              <Input
                id="create-user-name"
                name="name"
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
              <Label htmlFor="create-user-email">Email</Label>
              <Input
                id="create-user-email"
                name="email"
                type="email"
                placeholder="user@company.com"
                required
                invalid={Boolean(emailError)}
                aria-invalid={Boolean(emailError)}
              />
              {emailError ? (
                <p className="text-sm text-destructive">{emailError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-role">Role</Label>
              <select
                id="create-user-role"
                name="roleId"
                className={selectClasses}
                required
              >
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
              {roleIdError ? (
                <p className="text-sm text-destructive">{roleIdError}</p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="create-user-employee">Employee</Label>
              <select
                id="create-user-employee"
                name="employeeId"
                className={selectClasses}
                defaultValue=""
              >
                <option value="">
                  {employees.length > 0
                    ? "— Not linked to an employee"
                    : "— No unlinked employees available"}
                </option>
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
              <Label htmlFor="create-user-status">Status</Label>
              <select
                id="create-user-status"
                name="status"
                className={selectClasses}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
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

            <div className="space-y-2">
              <Label htmlFor="create-user-password">Password</Label>
              <Input
                id="create-user-password"
                name="password"
                type="password"
                placeholder="••••••••"
                autoComplete="new-password"
                required={status === "active"}
                invalid={Boolean(passwordError)}
                aria-invalid={Boolean(passwordError)}
              />
              <p className="text-xs text-muted-foreground">
                {status === "active"
                  ? "Required for an Active account. At least 8 characters."
                  : "Optional until the account is activated."}
              </p>
              {passwordError ? (
                <p className="text-sm text-destructive">{passwordError}</p>
              ) : null}
            </div>

            {isSuperAdmin ? (
              <p className="text-xs text-muted-foreground">
                Super Administrators can manage this account across
                organizations.
              </p>
            ) : null}

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
                {isPending ? "Creating..." : "Create user"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}