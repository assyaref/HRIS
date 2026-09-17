"use client";

import { useState } from "react";

import { Button, buttonVariants } from "@/components/ui/button";

interface PayslipDocumentViewProps {
  payslipId: string;
  payslipNumber: string;
}

export function PayslipDocumentView({
  payslipId,
  payslipNumber,
}: PayslipDocumentViewProps) {
  const [open, setOpen] = useState(false);

  const pdfUrl = `/api/payroll/payslips/${encodeURIComponent(
    payslipId
  )}/pdf`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
          aria-controls={`payslip-pdf-${payslipId}`}
        >
          {open ? "Hide PDF" : "View PDF"}
        </Button>

        <a
          href={pdfUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={buttonVariants({ size: "sm" })}
        >
          Open PDF
        </a>
      </div>

      {open ? (
        <div
          id={`payslip-pdf-${payslipId}`}
          className="overflow-hidden rounded-lg border border-border"
        >
          <iframe
            title={`Payslip PDF ${payslipNumber}`}
            src={pdfUrl}
            className="h-[720px] w-full"
          />
        </div>
      ) : null}
    </div>
  );
}
