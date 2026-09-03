"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { type EmployeeActionState } from "./actions";
import {
  EMPLOYEE_STATUS_LABELS,
  type EmployeeStatus,
} from "./constants";
import type { LinkableUser } from "./queries";

const initialState: EmployeeActionState = { status: "idle" };

export interface EmployeeEditorProps {
  employeeId: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  /** `YYYY-MM-DD` or empty. */
  hireDate: string;
  employmentStatus: EmployeeStatus;
  /** Linked user id or empty when unlinked. */
  userId: string;
  /** When false the Inactive option is hidden (only admins deactivate). */
  canDeactivate: boolean;
  linkableUsers: LinkableUser[];
  action: (
    prevState: EmployeeActionState,
    formData: FormData
  ) => Promise<EmployeeActionState>;
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : "Save changes"}
    </Button>
  );
}

/**
 * Employee profile editor (client leaf). The bound `updateEmployeeAction`
 * re-authenticates, re-authorizes and re-validates every submission; status
 * deactivation additionally requires `employees.delete` server-side.
 */
export function EmployeeEditor({
  employeeId,
  employeeNumber,
  firstName,
  lastName,
  email,
  phone,
  hireDate,
  employmentStatus,
  userId,
  canDeactivate,
  linkableUsers,
  action,
}: EmployeeEditorProps) {
  const [state, formAction] = useActionState(action, initialState);
  const errors = state.fieldErrors;
  const showInactive = canDeactivate || employmentStatus === "inactive";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit employee</CardTitle>
        <CardDescription>
          Update profile information, employment status and the optional linked
          sign-in account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {state.message && state.status !== "idle" ? (
          <div
            role={state.status === "error" ? "alert" : "status"}
            className={`mb-4 rounded-md border px-3 py-2 text-sm ${
              state.status === "success"
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            {state.message}
          </div>
        ) : null}

        <form action={formAction} noValidate className="space-y-4">
          <input type="hidden" name="employeeId" value={employeeId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-employee-number">Employee number</Label>
              <Input
                id="edit-employee-number"
                name="employeeNumber"
                defaultValue={employeeNumber}
                required
                invalid={Boolean(errors?.employeeNumber)}
                aria-invalid={Boolean(errors?.employeeNumber)}
              />
              <FieldError message={errors?.employeeNumber} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-employment-status">Status</Label>
              <select
                id="edit-employment-status"
                name="employmentStatus"
                defaultValue={employmentStatus}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <option value="active">{EMPLOYEE_STATUS_LABELS.active}</option>
                {showInactive ? (
                  <option value="inactive">
                    {EMPLOYEE_STATUS_LABELS.inactive}
                  </option>
                ) : null}
              </select>
              <p className="text-xs text-muted-foreground">
                {canDeactivate
                  ? "Setting a status to Inactive deactivates the employee (audited)."
                  : "Deactivating (Inactive) requires an administrator."}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-first-name">First name</Label>
              <Input
                id="edit-first-name"
                name="firstName"
                defaultValue={firstName}
                required
                invalid={Boolean(errors?.firstName)}
                aria-invalid={Boolean(errors?.firstName)}
              />
              <FieldError message={errors?.firstName} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-last-name">Last name</Label>
              <Input
                id="edit-last-name"
                name="lastName"
                defaultValue={lastName}
                required
                invalid={Boolean(errors?.lastName)}
                aria-invalid={Boolean(errors?.lastName)}
              />
              <FieldError message={errors?.lastName} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-email">Email</Label>
              <Input
                id="edit-email"
                name="email"
                type="email"
                defaultValue={email}
                invalid={Boolean(errors?.email)}
                aria-invalid={Boolean(errors?.email)}
              />
              <FieldError message={errors?.email} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-phone">Phone</Label>
              <Input
                id="edit-phone"
                name="phone"
                type="tel"
                defaultValue={phone}
                invalid={Boolean(errors?.phone)}
                aria-invalid={Boolean(errors?.phone)}
              />
              <FieldError message={errors?.phone} />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-hire-date">Hire date</Label>
              <Input
                id="edit-hire-date"
                name="hireDate"
                type="date"
                defaultValue={hireDate}
                invalid={Boolean(errors?.hireDate)}
                aria-invalid={Boolean(errors?.hireDate)}
              />
              <FieldError message={errors?.hireDate} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-linked-user">Linked account</Label>
              <select
                id="edit-linked-user"
                name="userId"
                defaultValue={userId}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <option value="">No linked account</option>
                {linkableUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.email}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Optional. Links this employee to an existing sign-in account in
                your organization.
              </p>
            </div>
          </div>

          <div className="flex justify-end border-t border-border pt-4">
            <SaveButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
