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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { notifier } from "@/lib/notifier";

import { updatePayrollPeriodAction } from "./actions";

/**
 * Edit a payroll period. Server-side rules drive what is actually editable:
 * `draft`/`cancelled` allow a full update; `processing` only allows the name.
 * A `locked` period is never editable (the page does not render this dialog).
 */
export function PayrollPeriodEditDialog({
  periodId,
  periodCode,
  periodName,
  periodStart,
  periodEnd,
  paymentDate,
  periodStatus,
}: {
  periodId: string;
  periodCode: string;
  periodName: string;
  periodStart: string;
  periodEnd: string;
  paymentDate: string;
  periodStatus: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const nameOnly = periodStatus === "processing";

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updatePayrollPeriodAction(periodId, {
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        periodStart: String(formData.get("periodStart") ?? ""),
        periodEnd: String(formData.get("periodEnd") ?? ""),
        paymentDate: String(formData.get("paymentDate") ?? ""),
      });
      if (result.ok) {
        setOpen(false);
        notifier.success(result.message);
        router.refresh();
      } else {
        setError(result.message);
        notifier.error(result.message);
      }
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Ubah
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ubah periode payroll</DialogTitle>
            <DialogDescription>
              {nameOnly
                ? "Periode ini sedang diproses — hanya nama periode yang dapat diubah."
                : "Perbarui detail siklus payroll. Tanggal memakai format YYYY-MM-DD dan disimpan dalam UTC."}
            </DialogDescription>
          </DialogHeader>
          <form action={submit} className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="edit-period-code">Kode</Label>
              <Input
                id="edit-period-code"
                name="code"
                value={periodCode}
                readOnly
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-period-name">Nama</Label>
              <Input
                id="edit-period-name"
                name="name"
                defaultValue={periodName}
                required
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="edit-period-start">Tanggal mulai</Label>
                <Input
                  id="edit-period-start"
                  name="periodStart"
                  type="date"
                  defaultValue={periodStart}
                  readOnly={nameOnly}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-period-end">Tanggal selesai</Label>
                <Input
                  id="edit-period-end"
                  name="periodEnd"
                  type="date"
                  defaultValue={periodEnd}
                  readOnly={nameOnly}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-period-payment">Tanggal pembayaran</Label>
                <Input
                  id="edit-period-payment"
                  name="paymentDate"
                  type="date"
                  defaultValue={paymentDate}
                  readOnly={nameOnly}
                  required
                />
              </div>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                Batal
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Menyimpan…" : "Simpan perubahan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}