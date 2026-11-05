"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

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

import {
  bulkPermanentlyDeleteEmployeesAction,
  type EmployeeBulkPermanentDeleteState,
} from "./actions";

interface BulkDeleteEmployeeTarget {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
}

interface EmployeeBulkDeleteDialogProps {
  open: boolean;
  onClose: () => void;
  /** The employees the operator explicitly selected on the current page. */
  employees: BulkDeleteEmployeeTarget[];
  /** The organization the listing is scoped to (all selected employees belong to it). */
  organizationId: string;
  /** Display name of that organization, when known. */
  organizationName?: string;
}

const initialState: EmployeeBulkPermanentDeleteState = { status: "idle" };

/**
 * Confirmation dialog for the Super Administrator's bulk permanent delete.
 *
 * The destructive action is gated on typing the exact phrase
 * `DELETE <count> EMPLOYEES`, so the operator must reconcile the count with
 * the selection shown in the dialog. The server action re-authorizes
 * (SUPERADMIN + `employees.permanent_delete`), re-scopes every id to the
 * listing's organization, and runs the whole batch in one transaction.
 */
export function EmployeeBulkDeleteDialog({
  open,
  onClose,
  employees,
  organizationId,
  organizationName,
}: EmployeeBulkDeleteDialogProps) {
  const router = useRouter();
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const handledSuccess = useRef(false);
  const [state, formAction, isPending] = useActionState(
    bulkPermanentlyDeleteEmployeesAction.bind(null, organizationId),
    initialState
  );

  const selectedCount = employees.length;
  const expectedConfirmation = `DELETE ${selectedCount} EMPLOYEES`;
  const confirmationMatches = confirmation === expectedConfirmation;
  const canSubmitDelete = confirmationMatches && acknowledged && !isPending;

  const displayLines = employees.map(
    (employee) =>
      `${employee.firstName} ${employee.lastName} (${employee.employeeNumber})`
  );

  function reset() {
    setConfirmation("");
    setAcknowledged(false);
  }

  useEffect(() => {
    if (state.status !== "success" || handledSuccess.current) return;
    handledSuccess.current = true;
    notifier.success(
      state.message ?? "Selected employees were permanently deleted."
    );
    reset();
    router.refresh();
    onClose();
  }, [state, router, onClose]);

  function submit() {
    const formData = new FormData();
    formData.set("employeeIds", JSON.stringify(employees.map((e) => e.id)));
    formData.set("confirmation", confirmation);
    formData.set(
      "acknowledgedBulkPermanentDelete",
      acknowledged ? "true" : ""
    );
    formAction(formData);
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className="text-destructive hover:bg-destructive/10"
        onClick={reset}
        aria-label="Delete selected employees"
        disabled={isPending}
      >
        Delete Selected Employees
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (isPending) return;
          if (!nextOpen) {
            reset();
            return;
          }
          setConfirmation("");
          setAcknowledged(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Permanently Delete Selected Employees?
            </DialogTitle>
            <DialogDescription>
              You are about to permanently delete {selectedCount} selected
              employee record{selectedCount === 1 ? "" : "s"}. This action
              cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <span className="text-muted-foreground">
                  Selected employees
                </span>
                <span className="font-mono font-medium">{selectedCount}</span>
                {organizationName ? (
                  <>
                    <span className="text-muted-foreground">Organization</span>
                    <span className="truncate">{organizationName}</span>
                  </>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {displayLines.join(" · ")}
              </p>
            </div>

            <div className="rounded-md border border-border bg-muted/40 p-3">
              <p className="text-xs font-medium text-muted-foreground">
                Related data impact
              </p>
              <p className="text-sm text-muted-foreground">
                Deletable related records (payroll, payslips, documents, face
                ID, project assignments and other profile records) are removed
                with each employee in a single transaction. Protected historical
                records (attendance, leave, permission and employment history)
                are retained for legal and audit purposes and are never deleted.
              </p>
            </div>

            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">
                This action cannot be undone.
              </p>
              <p className="mt-1 text-destructive/90">
                Deleted employee records and their deletable related records are
                permanently removed. Protected historical records are retained.
              </p>
            </div>

            <p className="text-sm font-medium">
              Type the confirmation phrase to enable deletion
            </p>
            <div className="space-y-2">
              <label
                htmlFor="bulk-delete-confirmation"
                className="text-xs text-muted-foreground"
              >
                Confirmation phrase
              </label>
              <Input
                id="bulk-delete-confirmation"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={expectedConfirmation}
                autoComplete="off"
                autoFocus
                disabled={isPending}
                className="font-mono"
              />
              <p
                id="bulk-delete-confirmation-help"
                className="text-xs text-muted-foreground"
              >
                Type exactly{" "}
                <span className="font-mono font-medium">{expectedConfirmation}</span>{" "}
                to enable deletion.
              </p>
              {confirmation !== "" && !confirmationMatches && (
                <p
                  className="text-xs text-destructive"
                  data-testid="bulk-delete-confirmation-mismatch"
                >
                  The phrase does not match the {selectedCount} selected
                  employee{selectedCount === 1 ? "" : "s"}.
                </p>
              )}
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={isPending}
                className="mt-0.5"
                data-testid="bulk-delete-acknowledgement"
              />
              <span>
                I understand that this action cannot be undone and I want to
                permanently delete these {selectedCount} employee{" "}
                {selectedCount === 1 ? "" : "s"}.
              </span>
            </label>

            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                data-testid="bulk-delete-error"
              >
                {state.message}
              </div>
            ) : null}

            {state.status === "success" ? (
              <div
                className="space-y-2 rounded-md border border-emerald-600/40 bg-emerald-500/5 px-3 py-2 text-sm"
                data-testid="bulk-delete-final-result"
              >
                <p className="font-medium text-emerald-700">
                  {state.deletedCount ?? 0} employee{(state.deletedCount ?? 0) === 1 ? "" : "s"} permanently deleted.
                </p>
                {state.deletedEmployeeNumbers &&
                state.deletedEmployeeNumbers.length > 0 ? (
                  <p className="text-xs font-medium text-muted-foreground">
                    {state.deletedEmployeeNumbers.join(", ")}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            {state.status === "success" ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onClose();
                  reset();
                }}
                data-testid="bulk-delete-final-result-close"
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={reset}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={!canSubmitDelete}
                  aria-disabled={!canSubmitDelete}
                  onClick={() => {
                    if (!canSubmitDelete) return;
                    submit();
                  }}
                >
                  {isPending
                    ? "Deleting…"
                    : `Delete ${selectedCount} Employee(s)`}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
