"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { EmployeeActionState } from "./actions";

const initialState: EmployeeActionState = { status: "idle" };

export function PermanentPurgeDialog({
  employeeId,
  employeeNumber,
  organizationId,
  action,
}: {
  employeeId: string;
  employeeNumber: string;
  organizationId: string;
  action: (
    prevState: EmployeeActionState | undefined,
    formData: FormData
  ) => Promise<EmployeeActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [confirmedEmployeeNumber, setConfirmedEmployeeNumber] = useState("");
  const [password, setPassword] = useState("");
  const [state, setState] =
    useState<EmployeeActionState>(initialState);

  function resetDialog() {
    setConfirmedEmployeeNumber("");
    setPassword("");
    setState(initialState);
    setPending(false);
  }

  function closeDialog() {
    if (pending) return;
    setOpen(false);
    resetDialog();
  }

  async function handlePurge() {
    if (confirmedEmployeeNumber !== employeeNumber) {
      setState({
        status: "error",
        message: "Employee number confirmation does not match.",
      });
      return;
    }

    if (!password) {
      setState({
        status: "error",
        message: "SUPERADMIN password is required.",
      });
      return;
    }

    setPending(true);
    setState(initialState);

    const formData = new FormData();
    formData.set("employeeId", employeeId);
    formData.set("employeeNumber", confirmedEmployeeNumber);
    formData.set("organizationId", organizationId);
    formData.set("password", password);

    try {
      const result = await action(undefined, formData);
      setState(result);

      if (result.status === "success") {
        setOpen(false);
        window.location.href = "/employees";
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        onClick={() => {
          setState(initialState);
          setOpen(true);
        }}
      >
        Permanent purge
      </Button>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (pending) return;

          if (!nextOpen) {
            closeDialog();
            return;
          }

          setOpen(true);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Permanently purge employee identity
            </DialogTitle>

            <DialogDescription>
              This is a destructive identity-purge operation and cannot be
              undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
              <p className="font-medium">
                Employee: {employeeNumber}
              </p>

              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>The employee login account will be deleted.</li>
                <li>Face enrollment and biometric templates will be deleted.</li>
                <li>Personal identity fields will be anonymized.</li>
                <li>HRIS business history will be retained.</li>
                <li>This operation cannot be reversed automatically.</li>
              </ul>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="purge-employee-number"
                className="text-sm font-medium"
              >
                Confirm employee number
              </label>

              <Input
                id="purge-employee-number"
                value={confirmedEmployeeNumber}
                onChange={(event) =>
                  setConfirmedEmployeeNumber(event.target.value)
                }
                placeholder={employeeNumber}
                autoComplete="off"
                disabled={pending}
              />

              <p className="text-xs text-muted-foreground">
                Enter exactly:{" "}
                <span className="font-mono font-medium">
                  {employeeNumber}
                </span>
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="purge-superadmin-password"
                className="text-sm font-medium"
              >
                SUPERADMIN password
              </label>

              <Input
                id="purge-superadmin-password"
                type="password"
                value={password}
                onChange={(event) =>
                  setPassword(event.target.value)
                }
                autoComplete="current-password"
                disabled={pending}
              />

              <p className="text-xs text-muted-foreground">
                Your current SUPERADMIN password is required to authorize
                this operation.
              </p>
            </div>

            {state.message ? (
              <div
                role={state.status === "error" ? "alert" : "status"}
                className={`rounded-md border px-3 py-2 text-sm ${
                  state.status === "error"
                    ? "border-destructive/40 bg-destructive/10 text-destructive"
                    : "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                }`}
              >
                {state.message}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={closeDialog}
            >
              Cancel
            </Button>

            <Button
              type="button"
              variant="destructive"
              disabled={
                pending ||
                confirmedEmployeeNumber !== employeeNumber ||
                !password
              }
              onClick={handlePurge}
            >
              {pending
                ? "Purging..."
                : "Permanently purge identity"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
