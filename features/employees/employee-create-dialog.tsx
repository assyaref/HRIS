"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

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

import type { LinkableUser } from "./queries";
import { createEmployeeAction, type EmployeeActionState } from "./actions";

const initialState: EmployeeActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Creating..." : "Create employee"}
    </Button>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-sm text-destructive">{message}</p>;
}

/**
 * "Add employee" dialog (client leaf). Submission runs in the
 * `createEmployeeAction` server action, which re-checks authentication and the
 * `employees.create` permission and always uses the caller's organization.
 */
export function CreateEmployeeDialog({
  linkableUsers,
}: {
  linkableUsers: LinkableUser[];
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(
    createEmployeeAction,
    initialState
  );

  const errors = state.fieldErrors;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Add employee
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add employee</DialogTitle>
            <DialogDescription>
              Create an employee record in your organization. New employees
              are created with an Active status.
            </DialogDescription>
          </DialogHeader>

          {state.message && state.status === "error" ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {state.message}
            </div>
          ) : null}

          <form action={formAction} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-number">Employee number</Label>
                <Input
                  id="employee-number"
                  name="employeeNumber"
                  placeholder="e.g. EMP-0001"
                  required
                  invalid={Boolean(errors?.employeeNumber)}
                  aria-invalid={Boolean(errors?.employeeNumber)}
                />
                <FieldError message={errors?.employeeNumber} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-hire-date">Hire date</Label>
                <Input
                  id="employee-hire-date"
                  name="hireDate"
                  type="date"
                  invalid={Boolean(errors?.hireDate)}
                  aria-invalid={Boolean(errors?.hireDate)}
                />
                <FieldError message={errors?.hireDate} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="first-name">First name</Label>
                <Input
                  id="first-name"
                  name="firstName"
                  placeholder="Jane"
                  autoComplete="given-name"
                  required
                  invalid={Boolean(errors?.firstName)}
                  aria-invalid={Boolean(errors?.firstName)}
                />
                <FieldError message={errors?.firstName} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last-name">Last name</Label>
                <Input
                  id="last-name"
                  name="lastName"
                  placeholder="Doe"
                  autoComplete="family-name"
                  required
                  invalid={Boolean(errors?.lastName)}
                  aria-invalid={Boolean(errors?.lastName)}
                />
                <FieldError message={errors?.lastName} />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="employee-email">Email</Label>
                <Input
                  id="employee-email"
                  name="email"
                  type="email"
                  placeholder="jane.doe@company.com"
                  autoComplete="email"
                  invalid={Boolean(errors?.email)}
                  aria-invalid={Boolean(errors?.email)}
                />
                <FieldError message={errors?.email} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="employee-phone">Phone</Label>
                <Input
                  id="employee-phone"
                  name="phone"
                  type="tel"
                  placeholder="+1 555 000 1234"
                  autoComplete="tel"
                  invalid={Boolean(errors?.phone)}
                  aria-invalid={Boolean(errors?.phone)}
                />
                <FieldError message={errors?.phone} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="employee-user">Linked account</Label>
              {linkableUsers.length > 0 ? (
                <>
                  <select
                    id="employee-user"
                    name="userId"
                    defaultValue=""
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
                    Optional. Links this employee to an existing sign-in
                    account in your organization. No credentials are created
                    here.
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No linkable user accounts are available in your organization.
                </p>
              )}
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <SubmitButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
