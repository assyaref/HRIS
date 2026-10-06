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

import { deletePayrollPeriodAction } from "./actions";
import { PAYROLL_PERIOD_STATUS_LABELS } from "./constants";

/**
 * Delete a payroll period.
 *
 * Flow: the Delete trigger first raises a warning toast, then opens a
 * confirmation dialog showing the period identity (name, window, payment date,
 * status). For `locked` periods an extra destructive-action warning is shown.
 * Success/errors are reported through the toast system and the period list is
 * refreshed.
 */
export function PayrollPeriodDeleteDialog({
  periodId,
  periodName,
  periodStart,
  periodEnd,
  paymentDate,
  periodStatus,
}: {
  periodId: string;
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

  const isLocked = periodStatus === "locked";
  const statusLabel = PAYROLL_PERIOD_STATUS_LABELS[periodStatus as keyof typeof PAYROLL_PERIOD_STATUS_LABELS] ?? periodStatus;

  function openConfirmation() {
    notifier.warning(
      isLocked
        ? `Locked Payroll Period: '${periodName}' is currently LOCKED. Deleting it is a destructive action and cannot be undone.`
        : `Warning: You are about to delete payroll period '${periodName}'. This action cannot be undone.`
    );
    setError(null);
    setOpen(true);
  }

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      const result = await deletePayrollPeriodAction(periodId);
      if (result.ok) {
        setOpen(false);
        notifier.success("Payroll period deleted successfully.");
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
        onClick={openConfirmation}
      >
        Delete
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {isLocked ? "Delete locked payroll period?" : "Delete payroll period?"}
            </DialogTitle>
            <DialogDescription>
              {isLocked
                ? "This payroll period is locked. Deleting it is a destructive action and cannot be undone."
                : "This payroll period will be permanently deleted. This action cannot be undone."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
            <div className="grid grid-cols-[8rem_1fr] gap-2 text-sm">
              <span className="text-slate-500">Period name</span>
              <span className="font-semibold text-slate-800">{periodName}</span>

              <span className="text-slate-500">Period window</span>
              <span className="font-medium text-slate-700">
                {periodStart}
                <span className="mx-1 text-slate-400">→</span>
                {periodEnd}
              </span>

              <span className="text-slate-500">Payment date</span>
              <span className="font-medium text-slate-700">{paymentDate}</span>

              <span className="text-slate-500">Status</span>
              <span className="font-medium text-slate-700">{statusLabel}</span>
            </div>

            {error ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={confirmDelete}
            >
              {pending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}