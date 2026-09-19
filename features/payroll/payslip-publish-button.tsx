"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

import { publishPayslipAction } from "./payslip-document.actions";

export interface PayslipPublishButtonProps {
  payslipId: string;
  payslipNumber: string;
  /** Optional styling override for the Publish trigger button. */
  className?: string;
}

/**
 * Mode B / Mode A — publish one generated payslip to employee self-service.
 *
 * Convenience surface only, never a security boundary. The page renders the
 * trigger solely for `generated` payslips and only when the actor holds a
 * payslip/payroll management permission; `publishPayslipAction` independently
 * re-checks authorization, organization scope and the payslip's current status
 * while holding the period and payslip row locks.
 */
export function PayslipPublishButton({
  payslipId,
  payslipNumber,
  className,
}: PayslipPublishButtonProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  function submit() {
    setMessage(null);
    setError(false);

    startTransition(async () => {
      const result = await publishPayslipAction(payslipId);
      setError(!result.ok);
      setMessage(result.message);

      if (result.ok) {
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={submit}
        className={className}
        aria-label={`Publish ${payslipNumber}`}
      >
        {pending ? "Publishing…" : "Publish"}
      </Button>

      {message ? (
        <p
          role={error ? "alert" : "status"}
          className={
            error
              ? "text-right text-xs text-destructive"
              : "text-right text-xs text-emerald-600 dark:text-emerald-400"
          }
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
