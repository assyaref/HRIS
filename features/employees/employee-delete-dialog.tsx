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

import { deleteEmployeeAction, type EmployeeActionState } from "./actions";
import { EmployeeStatusBadge } from "./employee-status-badge";
import type { EmployeeListItem } from "./queries";

const initialState: EmployeeActionState = { status: "idle" };

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

interface EmployeeDeleteDialogProps {
  employee: EmployeeListItem;
}

/**
 * Deactivation flow for one employee. The server action rechecks
 * `employees.delete`, organization scope, and self-linked-account protection,
 * then updates status and appends employment history in one transaction.
 */
export function EmployeeDeleteDialog({
  employee,
}: EmployeeDeleteDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    deleteEmployeeAction.bind(null, employee.id),
    initialState
  );

  if (state.status === "success" && open) {
    notifier.success(state.message ?? "Employee deactivated successfully.");
    setOpen(false);
  }

  function openWithWarning() {
    notifier.warning(
      `Warning: You are about to deactivate employee '${employee.firstName} ${employee.lastName}'. Historical records will be retained.`
    );
    setOpen(true);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={openWithWarning}
        aria-label={`Deactivate ${employee.firstName} ${employee.lastName}`}
      >
        Deactivate
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Deactivate employee?
            </DialogTitle>
            <DialogDescription>
              This changes the employee status to inactive and retains all
              master-data and historical records.
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

          <div className="space-y-3 rounded-md border border-destructive/40 p-4">
            <div className="grid grid-cols-[9rem_1fr] gap-x-3 gap-y-2 text-sm">
              <span className="text-muted-foreground">Employee</span>
              <span className="truncate font-medium">
                {employee.firstName} {employee.lastName}
              </span>
              <span className="text-muted-foreground">Employee No.</span>
              <span className="truncate font-mono text-xs">
                {employee.employeeNumber}
              </span>
              <span className="text-muted-foreground">Email</span>
              <span className="truncate font-medium">
                {employee.email ?? employee.linkedUserEmail ?? "—"}
              </span>
              <span className="text-muted-foreground">Status</span>
              <span>
                <EmployeeStatusBadge status={employee.employmentStatus} />
              </span>
              <span className="text-muted-foreground">Hire date</span>
              <span className="truncate">{formatDate(employee.hireDate)}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Attendance, payroll, leave, documents, custom values, and
              employment history remain linked to this employee.
            </p>
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
            <Button
              type="button"
              variant="destructive"
              disabled={isPending}
              onClick={() => formAction()}
            >
              {isPending ? "Deactivating..." : "Deactivate employee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}