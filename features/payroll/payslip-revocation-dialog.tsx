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
import { Label } from "@/components/ui/label";

import { revokePayslipAction } from "./actions";
import {
  isValidPayslipRevocationReason,
  PAYSLIP_REVOCATION_REASON_MAX_LENGTH,
} from "./payslip-revocation.guard";

export interface PayslipRevocationDialogProps {
  payslipId: string;
  payslipNumber: string;
  /** Optional styling override for the Revoke trigger button. */
  triggerClassName?: string;
}

/**
 * PM-07.3 — Revoke published payslip dialog (client leaf).
 *
 * This is only a convenience surface, never a security boundary. The page
 * renders the trigger solely for `published` payslips and only when the actor
 * holds `payslip.manage` or `payroll.manage`; the server action
 * `revokePayslipAction` independently re-checks authorization, organization
 * scope and the payslip's current status. Only a payslip id and number cross
 * the client boundary — no organization, employee or permissions.
 */
export function PayslipRevocationDialog({
  payslipId,
  payslipNumber,
  triggerClassName,
}: PayslipRevocationDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function openDialog() {
    setReason("");
    setError(null);
    setOpen(true);
  }

  function clientValidationError(value: string): string | null {
    if (!isValidPayslipRevocationReason(value)) {
      if (value.trim().length === 0) {
        return "Alasan pencabutan wajib diisi.";
      }
      return `Alasan pencabutan maksimal ${PAYSLIP_REVOCATION_REASON_MAX_LENGTH} karakter.`;
    }
    return null;
  }

  function submit() {
    const validationError = clientValidationError(reason);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    startTransition(async () => {
      const result = await revokePayslipAction(payslipId, reason.trim());
      if (result.ok) {
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
        variant="outline"
        size="sm"
        onClick={openDialog}
        disabled={pending}
        className={`border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 ${triggerClassName ?? ""}`}
      >
        Cabut
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Cabut slip gaji {payslipNumber}</DialogTitle>
            <DialogDescription>
              {payslipNumber} adalah slip gaji terbit dan saat ini terlihat oleh karyawan. Mencabutnya akan menghapus akses karyawan dan menandainya dicabut. Tindakan ini dicatat dan tidak dapat dibatalkan.
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <div
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
            >
              {error}
            </div>
          ) : null}

          <form
            action={submit}
            aria-label={`Cabut slip gaji ${payslipNumber}`}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="payslip-revocation-reason">
                Alasan pencabutan
              </Label>
              <textarea
                id="payslip-revocation-reason"
                name="reason"
                rows={4}
                required
                maxLength={PAYSLIP_REVOCATION_REASON_MAX_LENGTH}
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                disabled={pending}
                placeholder="Jelaskan alasan slip gaji yang sudah terbit ini harus dicabut."
                className="flex min-h-24 w-full rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-sm outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:ring-2 focus-visible:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <p className="text-xs text-muted-foreground">
                Wajib. Alasan disimpan di riwayat slip gaji.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={pending}
              >
                Batal
              </Button>
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending ? "Mencabut…" : "Cabut slip gaji"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}