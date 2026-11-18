"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { notifier } from "@/lib/notifier";

/**
 * Shared building blocks for record dialogs (compliance, time management…):
 * an action runner with toast + refresh, a two-column form dialog, an
 * employee picker and a delete confirmation. Server actions return
 * `{ ok, message }`.
 */

export interface ActionResult {
  ok: boolean;
  message: string;
}

export interface EmployeeOption {
  id: string;
  employeeNumber: string;
  name: string;
}

/** Runs an action: toast on success + refresh; inline error otherwise. */
export function useRunner() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(task: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await task();
        if (result.ok) {
          notifier.success(result.message);
          onSuccess?.();
          router.refresh();
        } else {
          setError(result.message);
          notifier.error(result.message);
        }
      } catch {
        const message = "Gagal menyimpan. Coba lagi.";
        setError(message);
        notifier.error(message);
      }
    });
  }
  return { pending, error, setError, run };
}

export function Field({ label, htmlFor, children, wide }: { label: string; htmlFor: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "space-y-2 sm:col-span-2" : "space-y-2"}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  pending,
  error,
  onSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  pending: boolean;
  error: string | null;
  onSubmit: (formData: FormData) => void;
  children: ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {error ? (
          <p role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <form
          noValidate
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit(new FormData(event.currentTarget));
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">{children}</div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Menyimpan..." : "Simpan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EmployeeSelect({ id, employees, value }: { id: string; employees: EmployeeOption[]; value?: string }) {
  return (
    <NativeSelect id={id} name="employeeId" defaultValue={value ?? ""} required>
      <option value="">Pilih karyawan</option>
      {employees.map((e) => (
        <option key={e.id} value={e.id}>
          {e.employeeNumber} — {e.name}
        </option>
      ))}
    </NativeSelect>
  );
}

export function ConfirmDelete({ label, onConfirm, pending }: { label: string; onConfirm: () => void; pending: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="ghost" size="sm" className="text-destructive" onClick={() => setOpen(true)}>
        Hapus
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Hapus data?</DialogTitle>
            <DialogDescription>{label} akan dihapus permanen.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() => {
                onConfirm();
                setOpen(false);
              }}
            >
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

