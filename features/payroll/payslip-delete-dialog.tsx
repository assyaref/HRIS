"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { notifier } from "@/lib/notifier";

import { deleteRevokedPayslipAction } from "./actions";

/**
 * Permanent delete of a REVOKED payslip (Super Administrator only).
 *
 * Convenience surface only: the page renders it for revoked payslips when the
 * session holds the SUPERADMIN role, and `deleteRevokedPayslipAction`
 * re-checks the role, the organization scope and the status.
 */
export function PayslipDeleteDialog({
  payslipId,
  payslipNumber,
  triggerClassName,
}: {
  payslipId: string;
  payslipNumber: string;
  triggerClassName?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await deleteRevokedPayslipAction(payslipId);
      if (result.ok) {
        notifier.success(result.message);
        setOpen(false);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        className={triggerClassName}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        Hapus
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus slip gaji {payslipNumber}?</DialogTitle>
            <DialogDescription>
              Slip gaji yang sudah di-revoke ini beserta seluruh berkas PDF-nya
              akan dihapus permanen. Jejak kejadian payroll tetap tersimpan.
              Tindakan ini tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setOpen(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirm}
            >
              {pending ? "Menghapus…" : "Hapus permanen"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
