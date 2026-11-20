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

import { createRoleAction, type RoleActionState } from "./actions";

const initialState: RoleActionState = { status: "idle" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Membuat..." : "Buat peran"}
    </Button>
  );
}

/**
 * "New role" dialog (client leaf). The actual role creation runs in the
 * `createRoleAction` server action, which re-checks authentication and the
 * `roles.create` permission server-side.
 */
export function CreateRoleDialog() {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useActionState(createRoleAction, initialState);

  const codeError = state.fieldErrors?.code;
  const nameError = state.fieldErrors?.name;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Peran baru
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Buat peran</DialogTitle>
            <DialogDescription>
              Roles group permissions. System catalog roles are pre-seeded;
              use this to add organization-specific custom roles.
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
            <div className="space-y-2">
              <Label htmlFor="role-code">Kode</Label>
              <Input
                id="role-code"
                name="code"
                placeholder="e.g. PAYROLL_ADMIN"
                autoCapitalize="characters"
                spellCheck={false}
                required
                invalid={Boolean(codeError)}
                aria-invalid={Boolean(codeError)}
                aria-describedby={codeError ? "role-code-error" : undefined}
              />
              {codeError ? (
                <p id="role-code-error" className="text-sm text-destructive">
                  {codeError}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Huruf kapital, angka, dan garis bawah. Kode peran sistem yang dicadangkan tidak dapat dipakai.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-name">Nama</Label>
              <Input
                id="role-name"
                name="name"
                placeholder="e.g. Payroll Administrator"
                required
                invalid={Boolean(nameError)}
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? "role-name-error" : undefined}
              />
              {nameError ? (
                <p id="role-name-error" className="text-sm text-destructive">
                  {nameError}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="role-description">Deskripsi</Label>
              <Input
                id="role-description"
                name="description"
                placeholder="Apa tanggung jawab peran ini?"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <SubmitButton />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
