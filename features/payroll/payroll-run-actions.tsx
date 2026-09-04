"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  approvePayrollRunAction,
  calculatePayrollAction,
  cancelPayrollPeriodAction,
  generatePayslipsAction,
  lockPayrollRunAction,
  publishPayslipsAction,
  rejectPayrollRunAction,
  submitPayrollRunAction,
} from "./actions";

export interface PayrollRunActionsProps {
  periodId: string;
  periodStatus: string;
  runStatus: string | null;
  canCalculate: boolean;
  canSubmit: boolean;
  canApprove: boolean;
  canReject: boolean;
  canLock: boolean;
  canCancel: boolean;
  canGeneratePayslips: boolean;
  canPublishPayslips: boolean;
}

/**
 * Payroll workflow actions. Each button is only rendered when the current
 * status permits the transition; the server action re-validates everything.
 */
export function PayrollRunActions({
  periodId,
  periodStatus,
  runStatus,
  canCalculate,
  canSubmit,
  canApprove,
  canReject,
  canLock,
  canCancel,
  canGeneratePayslips,
  canPublishPayslips,
}: PayrollRunActionsProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [message, setMessage] = useState<{
    tone: "error" | "success";
    text: string;
  } | null>(null);

  function run(action: () => Promise<{ ok: boolean; message: string }>) {
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      setRejectOpen(false);
      router.refresh();
    });
  }

  function reject(formData: FormData) {
    const reason = String(formData.get("reason") ?? "");
    setMessage(null);
    startTransition(async () => {
      const result = await rejectPayrollRunAction(periodId, reason);
      setMessage({ tone: result.ok ? "success" : "error", text: result.message });
      setRejectOpen(false);
      router.refresh();
    });
  }

  const showCalculate =
    canCalculate &&
    periodStatus === "draft" &&
    (!runStatus || runStatus === "draft" || runStatus === "rejected");
  const showSubmit = canSubmit && runStatus === "calculated";
  const showApprove = canApprove && runStatus === "submitted";
  const showReject = canReject && runStatus === "submitted";
  const showLock = canLock && runStatus === "approved";
  const showCancel = canCancel && periodStatus === "draft";
  const canPayslipState = runStatus === "approved" || runStatus === "locked";
  const showGenerate = canGeneratePayslips && canPayslipState;
  const showPublish = canPublishPayslips && canPayslipState;

  const hasAnyVisible =
    showCalculate ||
    showSubmit ||
    showApprove ||
    showReject ||
    showLock ||
    showCancel ||
    showGenerate ||
    showPublish;

  if (!hasAnyVisible) return null;

  return (
    <div className="space-y-4">
      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-md border px-3 py-2 text-sm ${
            message.tone === "success"
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          {message.text}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {showCalculate ? (
          <Button
            type="button"
            onClick={() => run(() => calculatePayrollAction(periodId))}
            disabled={pending}
          >
            {pending ? "Working…" : "Calculate run"}
          </Button>
        ) : null}
        {showSubmit ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => run(() => submitPayrollRunAction(periodId))}
            disabled={pending}
          >
            Submit for approval
          </Button>
        ) : null}
        {showApprove ? (
          <Button
            type="button"
            onClick={() => run(() => approvePayrollRunAction(periodId))}
            disabled={pending}
          >
            Approve
          </Button>
        ) : null}
        {showReject && !rejectOpen ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => setRejectOpen(true)}
            disabled={pending}
          >
            Reject
          </Button>
        ) : null}
        {showReject && rejectOpen ? (
          <form
            action={reject}
            className="w-full space-y-3 rounded-md border border-border p-3"
          >
            <div className="space-y-2">
              <Label htmlFor="reject-reason">Reason for rejection</Label>
              <textarea
                id="reject-reason"
                name="reason"
                rows={2}
                required
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setRejectOpen(false)}
                disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                size="sm"
                disabled={pending}
              >
                {pending ? "Rejecting…" : "Confirm rejection"}
              </Button>
            </div>
          </form>
        ) : null}
        {showLock ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => run(() => lockPayrollRunAction(periodId))}
            disabled={pending}
          >
            Lock and finalize
          </Button>
        ) : null}
        {showCancel ? (
          <Button
            type="button"
            variant="destructive"
            onClick={() => run(() => cancelPayrollPeriodAction(periodId))}
            disabled={pending}
          >
            Cancel period
          </Button>
        ) : null}
        {showGenerate ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => run(() => generatePayslipsAction(periodId))}
            disabled={pending}
          >
            Generate payslips
          </Button>
        ) : null}
        {showPublish ? (
          <Button
            type="button"
            onClick={() => run(() => publishPayslipsAction(periodId))}
            disabled={pending}
          >
            Publish payslips
          </Button>
        ) : null}
      </div>
    </div>
  );
}

