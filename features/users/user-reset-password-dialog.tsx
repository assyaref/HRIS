"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifier } from "@/lib/notifier";

import { resetUserPasswordAction, type UserActionState } from "./actions";

const initialState: UserActionState = { status: "idle" };

interface ResetPasswordDialogProps {
  user: {
    id: string;
    name: string | null;
    email: string;
    employeeNumber: string | null;
    employeeName: string | null;
  };
}

export function ResetPasswordDialog({ user }: ResetPasswordDialogProps) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(resetUserPasswordAction.bind(null, user.id), initialState);

  const employeeIdentifier = user.employeeNumber ?? user.employeeName ?? user.name ?? "—";

  function handleSubmit(formData: FormData) {
    formAction(formData);
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        aria-label={`Reset password for ${user.email}`}
      >
        Reset Password
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Karyawan: {employeeIdentifier} ({user.email})
            </DialogDescription>
          </DialogHeader>

          {state.status === "error" && state.message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive mb-4"
            >
              {state.message}
            </div>
          ) : null}

          {state.status === "success" && state.temporaryPassword ? (
            <div className="space-y-3 mb-4 p-3 rounded-md border border-emerald-600/40 bg-emerald-600/10">
              <p className="text-sm text-emerald-700 font-medium">Password Sementara:</p>
              <div className="flex gap-2">
                <code className="flex-1 bg-background px-3 py-2 rounded-md text-sm font-mono text-emerald-700 break-all">
                  {state.temporaryPassword}
                </code>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(state.temporaryPassword!);
                    notifier.success("Password disalin ke clipboard");
                  }}
                  className="px-3 py-2 text-sm text-emerald-700 hover:bg-emerald-100 rounded-md"
                >
                  Salin
                </button>
              </div>
              <p className="text-xs text-emerald-700">
                Berikan password ini kepada karyawan. Mereka wajib mengganti password pada login berikutnya.
              </p>
            </div>
          ) : null}

          <form
            action={handleSubmit}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="temporaryPassword">Password Sementara</Label>
              <Input
                id="temporaryPassword"
                name="temporaryPassword"
                type="text"
                autoComplete="off"
                placeholder={user.employeeNumber ? `Default: ${user.employeeNumber}` : "Kosongkan untuk generate otomatis"}
                value={state.status === "idle" ? "" : undefined}
              />
              <p className="text-xs text-muted-foreground">
                Kosongkan untuk menggunakan Nomor Karyawan ({user.employeeNumber ?? "tidak tersedia"}) atau generate otomatis.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="forceChange"
                name="forceChange"
                checked={true}
                disabled
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
              <Label htmlFor="forceChange" className="text-sm font-normal cursor-default">
                Wajib ganti password pada login berikutnya
              </Label>
            </div>

            <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
                Batal
              </Button>
              <Button type="submit" disabled={state.status === "success"}>
                {state.status === "success" ? "Selesai" : "Reset Password"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}