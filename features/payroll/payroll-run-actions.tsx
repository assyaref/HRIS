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

  const actionBase =
    "min-h-11 rounded-xl px-4 text-sm font-semibold shadow-sm transition-all duration-200 hover:-translate-y-px active:translate-y-0 disabled:pointer-events-none disabled:opacity-60";

  return (
    <div className="space-y-4">
      {message ? (
        <div
          role={message.tone === "error" ? "alert" : "status"}
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <div className="flex items-start gap-2">
            <span className="mt-0.5 font-bold">
              {message.tone === "success" ? "✓" : "!"}
            </span>
            <span>{message.text}</span>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-blue-100 bg-[#EAF5FF]/60 p-4">
        <p className="mb-3 text-xs font-bold uppercase tracking-wide text-[#0F6FD1]">
          Available workflow actions
        </p>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showCalculate ? (
            <Button
              type="button"
              onClick={() => run(() => calculatePayrollAction(periodId))}
              disabled={pending}
              className={`${actionBase} bg-[#1687F8] text-white hover:bg-[#0F6FD1]`}
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
              className={`${actionBase} bg-white text-[#0F6FD1] ring-1 ring-blue-200 hover:bg-blue-50`}
            >
              Submit for approval
            </Button>
          ) : null}

          {showApprove ? (
            <Button
              type="button"
              onClick={() => run(() => approvePayrollRunAction(periodId))}
              disabled={pending}
              className={`${actionBase} bg-emerald-600 text-white hover:bg-emerald-700`}
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
              className={`${actionBase} bg-red-50 text-red-700 ring-1 ring-red-200 hover:bg-red-100`}
            >
              Reject
            </Button>
          ) : null}

          {showLock ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => run(() => lockPayrollRunAction(periodId))}
              disabled={pending}
              className={`${actionBase} bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50`}
            >
              Lock and finalize
            </Button>
          ) : null}

          {showGenerate ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => run(() => generatePayslipsAction(periodId))}
              disabled={pending}
              className={`${actionBase} border-violet-200 bg-white text-violet-700 hover:bg-violet-50`}
            >
              Generate payslips
            </Button>
          ) : null}

          {showPublish ? (
            <Button
              type="button"
              onClick={() => run(() => publishPayslipsAction(periodId))}
              disabled={pending}
              className={`${actionBase} bg-[#1687F8] text-white hover:bg-[#0F6FD1]`}
            >
              Publish payslips
            </Button>
          ) : null}

          {showCancel ? (
            <Button
              type="button"
              variant="destructive"
              onClick={() => run(() => cancelPayrollPeriodAction(periodId))}
              disabled={pending}
              className={`${actionBase} bg-white text-red-700 ring-1 ring-red-200 hover:bg-red-50`}
            >
              Cancel period
            </Button>
          ) : null}
        </div>
      </div>

      {showReject && rejectOpen ? (
        <form
          action={reject}
          className="space-y-4 rounded-2xl border border-red-200 bg-red-50/60 p-4 sm:p-5"
        >
          <div>
            <p className="text-sm font-bold text-red-800">
              Reject payroll run
            </p>
            <p className="mt-1 text-xs text-red-600">
              Provide a reason that will be recorded with the workflow event.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reject-reason" className="text-red-900">
              Reason for rejection
            </Label>
            <textarea
              id="reject-reason"
              name="reason"
              rows={3}
              required
              className="flex min-h-24 w-full rounded-xl border border-red-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition-colors placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-red-300"
            />
          </div>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRejectOpen(false)}
              disabled={pending}
              className="min-h-11 rounded-xl"
            >
              Keep payroll
            </Button>

            <Button
              type="submit"
              variant="destructive"
              size="sm"
              disabled={pending}
              className="min-h-11 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700"
            >
              {pending ? "Rejecting…" : "Confirm rejection"}
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
