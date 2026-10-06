"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

import {
  bulkUploadDistributionPayslipsAction,
  type BulkDistributionPayslipActionResult,
  type BulkDistributionPayslipEntryResult,
} from "./payslip-document.actions";
import {
  buildPayslipPdfUploadDecision,
  sanitizePayslipOriginalFilename,
} from "./payslip-document.guard";
import {
  extractEmployeeNumberFromFilename,
  PAYSLIP_BULK_MAX_FILES,
} from "./payslip-bulk.guard";
import type { DistributionPeriodOption } from "./distribution-payslip-upload";

interface BulkDistributionPayslipUploadProps {
  periods: DistributionPeriodOption[];
  defaultPeriodId?: string;
}

function statusLabel(status: BulkDistributionPayslipEntryResult["status"]) {
  switch (status) {
    case "created":
      return "Uploaded";
    case "invalid_filename":
      return "Invalid filename";
    case "unknown_employee":
      return "Unknown employee";
    case "duplicate_employee":
      return "Duplicate";
    case "missing_birth_date":
      return "Missing birth date";
    case "invalid_file":
      return "Invalid file";
    case "write_failed":
      return "Failed";
    default:
      return status;
  }
}

function statusClass(status: BulkDistributionPayslipEntryResult["status"]) {
  return status === "created"
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-destructive";
}

/**
 * Mode B — bulk distribution PDF upload. This is a client leaf: all files are
 * validated again and the PDF password is derived and applied exclusively on
 * the server. The server returns a per-file report that is always rendered in
 * full, so no file is silently dropped.
 */
export function BulkDistributionPayslipUpload({
  periods,
  defaultPeriodId,
}: BulkDistributionPayslipUploadProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);

  const [periodId, setPeriodId] = useState(defaultPeriodId ?? "");
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [result, setResult] =
    useState<BulkDistributionPayslipActionResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    setResult(null);
    setFileError(null);

    const selected = Array.from(event.target.files ?? []);

    if (selected.length === 0) {
      setFiles([]);
      return;
    }

    if (selected.length > PAYSLIP_BULK_MAX_FILES) {
      setFiles([]);
      setFileError(
        `A bulk upload cannot contain more than ${PAYSLIP_BULK_MAX_FILES} files.`
      );
      if (inputRef.current) {
        inputRef.current.value = "";
      }
      return;
    }

    const problems: string[] = [];
    const accepted: File[] = [];

    for (const file of selected) {
      const filename = sanitizePayslipOriginalFilename(file.name);

      const fileDecision = buildPayslipPdfUploadDecision({
        mimeType: file.type,
        filename,
        size: file.size,
      });

      if (!fileDecision.allowed) {
        problems.push(`${file.name}: ${fileDecision.message}`);
        continue;
      }

      if (!extractEmployeeNumberFromFilename(filename)) {
        problems.push(
          `${file.name}: the filename must start with the employee number (digits), e.g. 03233.pdf.`
        );
        continue;
      }

      accepted.push(file);
    }

    setFiles(accepted);

    if (problems.length > 0) {
      setFileError(
        `${problems.length} file${
          problems.length === 1 ? "" : "s"
        } cannot be uploaded and will be skipped:\n${problems.join("\n")}`
      );
    }
  }

  function submit() {
    setResult(null);
    setFileError(null);

    if (!periodId) {
      setFileError("Please select a payroll period.");
      return;
    }

    if (files.length === 0) {
      setFileError("Please select at least one PDF payslip.");
      return;
    }

    const formData = new FormData();
    formData.set("periodId", periodId);

    for (const file of files) {
      formData.append("files", file);
    }

    startTransition(async () => {
      const outcome = await bulkUploadDistributionPayslipsAction(formData);

      setResult(outcome);

      if (outcome.createdCount > 0) {
        setFiles([]);

        if (inputRef.current) {
          inputRef.current.value = "";
        }

        router.refresh();
      }
    });
  }

  function reset() {
    setFiles([]);
    setResult(null);
    setFileError(null);

    if (inputRef.current) {
      inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Label htmlFor="bulk-period">Payroll period</Label>
        <select
          id="bulk-period"
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
        <Label htmlFor="bulk-files">Payslip PDFs</Label>
        <input
          id="bulk-files"
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          disabled={pending}
          onChange={handleFileChange}
          className="block w-full cursor-pointer rounded-md border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm file:font-medium disabled:cursor-not-allowed disabled:opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Up to {PAYSLIP_BULK_MAX_FILES} PDFs. Each filename must start with the
          employee number, e.g. 03233.pdf. The PDF password (employee number +
          birth date DDMMYYYY) is applied on the server and never stored.
        </p>
      </div>

      {files.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          {files.length} file{files.length === 1 ? "" : "s"} ready to upload.
        </p>
      ) : null}

      {fileError ? (
        <p
          role="alert"
          className="whitespace-pre-line rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {fileError}
        </p>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {files.length > 0 || result ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={reset}
          >
            Clear
          </Button>
        ) : null}
        <Button type="button" disabled={pending} onClick={submit}>
          {pending
            ? "Uploading…"
            : `Upload ${files.length > 0 ? files.length : ""} payslip${
                files.length === 1 ? "" : "s"
              }`}
        </Button>
      </div>

      {result ? (
        <div className="space-y-3">
          <p
            role={result.ok ? "status" : "alert"}
            className={
              result.ok
                ? "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
            }
          >
            {result.message}
          </p>

          <div className="overflow-x-auto rounded-md border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    File
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Employee
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Status
                  </th>
                  <th className="px-3 py-2 font-semibold text-slate-600">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.entries.map((entry) => (
                  <tr key={`${entry.filename}-${entry.status}`}>
                    <td className="max-w-[220px] truncate px-3 py-2 text-slate-700">
                      {entry.filename}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {entry.employeeNumber ?? "—"}
                      {entry.employeeName ? ` · ${entry.employeeName}` : ""}
                    </td>
                    <td
                      className={`px-3 py-2 font-medium ${statusClass(
                        entry.status
                      )}`}
                    >
                      {statusLabel(entry.status)}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {entry.message ||
                        (entry.payslipNumber
                          ? `${entry.payslipNumber} · generated`
                          : "—")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
