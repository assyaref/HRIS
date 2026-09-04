"use client";

import { useState, useActionState } from "react";

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
import { Badge } from "@/components/ui/badge";

import type { createEmployeeAccountAction } from "./actions";

interface CreateAccountDialogProps {
  employeeId: string;
  employeeEmail: string | null;
  action: typeof createEmployeeAccountAction;
  canCreate: boolean;
}

export function CreateAccountDialog({
  employeeId,
  employeeEmail,
  action,
  canCreate,
}: CreateAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    action.bind(null, employeeId),
    { status: "idle" }
  );

  // Close dialog when the action succeeds
  if (state.status === "success" && open) {
    setOpen(false);
  }

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        disabled={!canCreate}
        className="mt-2"
        onClick={() => setOpen(true)}
      >
        Create Login Account
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create Login Account</DialogTitle>
            <DialogDescription>
              Create a system login account for this employee. The employee will be
              able to sign in to the HRIS dashboard with the credentials you provide.
            </DialogDescription>
          </DialogHeader>
          <form action={formAction} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                defaultValue={employeeEmail ?? ""}
                placeholder="employee@company.com"
                required
              />
              {state.fieldErrors?.email && (
                <p className="text-sm text-destructive">{state.fieldErrors.email}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                placeholder="••••••••"
                required
              />
              {state.fieldErrors?.password && (
                <p className="text-sm text-destructive">{state.fieldErrors.password}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                placeholder="••••••••"
                required
              />
              {state.fieldErrors?.confirmPassword && (
                <p className="text-sm text-destructive">{state.fieldErrors.confirmPassword}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Role</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="role"
                  name="role"
                  value="EMPLOYEE"
                  readOnly
                  disabled
                  className="bg-muted"
                />
                <Badge variant="secondary">Default</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Employee accounts receive the EMPLOYEE role by default.
              </p>
            </div>
            {state.status === "error" && state.message && (
              <p className="text-sm text-destructive">{state.message}</p>
            )}
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
                {isPending ? "Creating..." : "Create Account"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}