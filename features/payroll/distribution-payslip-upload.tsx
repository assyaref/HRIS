"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import { uploadDistributionPayslipPdfAction } from "./payslip-document.actions";
import { buildPayslipPdfUploadDecision } from "./payslip-document.guard";

export interface DistributionPeriodOption {
  id: string;
  code: string;
  name: string;
}

export interface DistributionEmployeeOption {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  hasBirthDate: boolean;
}

interface DistributionPayslipUploadProps {
  periods: DistributionPeriodOption[];
  employees: DistributionEmployeeOption[];
  /** Preselected period coming from the period page. */
  defaultPeriodId?: string;
}

/**
 * Mode B — upload one payslip PDF for direct distribution. Client leaf only:
 * every identifier is validated again server-side and the PDF password is
 * derived and applied exclusively on the server.
 */
export function DistributionPayslipUpload({
  periods,
  employees,
  defaultPeriodId,
}: DistributionPayslipUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [periodId, setPeriodId] = useState(defaultPeriodId ?? "");
  const [employeeId, setEmployeeId] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const selectedEmployee = employees.find((e) => e.id === employeeId);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;

    setMessage(null);
    setError(false);
    setSelectedFile(file);

    if (!file) return;

    const decision = buildPayslipPdfUploadDecision({
      mimeType: file.type,
      filename: file.name,
      size: file.size,
    });

    if (!decision.allowed) {
      setSelectedFile(null);
      setError(true);
      setMessage(decision.message);
      event.target.value = "";
    }
  }

  function submit() {
    setMessage(null);
    setError(false);

    if (!periodId) {
      setError(true);
      setMessage("Please select a payroll period.");
      return;
    }

    if (!employeeId) {
      setError(true);
      setMessage("Please select an employee.");
      return;
    }

    if (selectedEmployee && !selectedEmployee.hasBirthDate) {
      setError(true);
      setMessage(
        "The selected employee has no birth date. Add it in the employee record before uploading a payslip."
      );
      return;
    }

    if (!selectedFile) {
      setError(true);
      setMessage("Please select a PDF payslip.");
      return;
    }

    const formData = new FormData();
    formData.set("periodId", periodId);
    formData.set("employeeId", employeeId);
    formData.set("file", selectedFile);

    startTransition(async () => {
      const result = await uploadDistributionPayslipPdfAction(formData);

      setError(!result.ok);
      setMessage(result.message);

      if (result.ok) {
        setSelectedFile(null);
        setEmployeeId("");

        if (inputRef.current) {
          inputRef.current.value = "";
        }

        router.push(`/payroll/${periodId}`);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="distribution-period">Payroll period</Label>
          <select
            id="distribution-period"
            value={periodId}
            disabled={pending}
            onChange={(event) => setPeriodId(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select a period…</option>
            {periods.map((period) => (
              <option key={period.id} value={period.id}>
                {period.code} · {period.name}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="distribution-employee">Employee</Label>
          <select
            id="distribution-employee"
            value={employeeId}
            disabled={pending}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Select an employee…</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employeeNumber} · {employee.lastName},{" "}
                {employee.firstName}
                {employee.hasBirthDate ? "" : " (no birth date)"}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="distribution-file">Payslip PDF</Label>
        <input
          id="distribution-file"
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={pending}
          onChange={handleFileChange}
          className="block w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          The PDF is encrypted with the employee number + birth date password
          (DDMMYYYY) before it is stored.
        </p>
      </div>

      {message ? (
        <p
          role={error ? "alert" : "status"}
          className={
            error
              ? "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
              : "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
          }
        >
          {message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" disabled={pending} onClick={submit}>
          {pending ? "Uploading…" : "Upload distribution payslip"}
        </Button>
      </div>
    </div>
  );
}
