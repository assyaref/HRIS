"use client";

import { useRef, useState } from "react";
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

import {
  confirmExcelImportAction,
  previewExcelImportAction,
  type ExcelImportPreviewResult,
} from "./import-action";

const initialResult: ExcelImportPreviewResult = {
  status: "idle",
  totalRows: 0,
  createCount: 0,
  updateCount: 0,
  errorCount: 0,
  previewErrors: [],
  sheetNames: [],
  plan: [],
};

const STEPS = ["Upload", "Validate", "Preview", "Import"] as const;

function StepIndicator({ step }: { step: number }) {
  return (
    <ol className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
      {STEPS.map((label, index) => {
        const done = step > index;
        const active = step === index;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              aria-current={active ? "step" : undefined}
              className={
                done
                  ? "flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white"
                  : active
                    ? "flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground"
                    : "flex h-5 w-5 items-center justify-center rounded-full border border-border"
              }
            >
              {index + 1}
            </span>
            <span
              className={
                active
                  ? "font-medium text-foreground"
                  : done
                    ? "text-foreground"
                    : ""
              }
            >
              {label}
            </span>
            {index < STEPS.length - 1 ? <span aria-hidden>—</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Excel import wizard (Upload → Validate → Preview → Import).
 *
 * The workbook is uploaded once and kept in this component. Preview
 * validates against the organization (existing employee numbers, active
 * custom field definitions); confirm RE-PARSES the file server-side so the
 * classification written to the database is never trusted from the browser.
 */
export function ImportExcelDialog() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] =
    useState<ExcelImportPreviewResult>(initialResult);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);

  function openDialog() {
    notifier.warning(
      "Excel import can UPDATE existing employees (matched by Employee No.) as well as create new ones. Review the preview carefully."
    );
    setResult(initialResult);
    setFile(null);
    setStep(0);
    setOpen(true);
  }

  function pickFile(next: File | null) {
    setFile(next);
    setResult(initialResult);
    setStep(0);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function runPreview() {
    if (!file) {
      setResult({
        ...initialResult,
        status: "error",
        message: "Choose a .xlsx file first.",
      });
      return;
    }
    setBusy(true);
    setStep(1);
    try {
      const payload = new FormData();
      payload.append("excelFile", file);
      const next = await previewExcelImportAction(initialResult, payload);
      setResult(next);
      if (next.status === "error") {
        setStep(0);
      } else {
        setStep(2);
      }
    } catch {
      setResult({
        ...initialResult,
        status: "error",
        message: "Could not validate the file. Please try again.",
      });
      setStep(0);
    } finally {
      setBusy(false);
    }
  }

  async function runConfirm() {
    if (!file) return;
    setBusy(true);
    setStep(3);
    try {
      const payload = new FormData();
      payload.append("excelFile", file);
      const next = await confirmExcelImportAction(result, payload);
      setResult(next);
      if (next.status === "success") {
        notifier.success(next.message ?? "Excel import complete.");
        router.refresh();
      } else {
        notifier.error(next.message ?? "Import failed.");
        setStep(2);
      }
    } catch {
      setResult({
        ...initialResult,
        status: "error",
        message: "Could not process the import request. Please try again.",
      });
      setStep(0);
    } finally {
      setBusy(false);
    }
  }

  const importCount = result.createCount + result.updateCount;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={openDialog}
        aria-label="Import employees from Excel"
      >
        Import Excel
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import employees from Excel</DialogTitle>
            <DialogDescription>
              Unknown Employee No. rows are created; existing rows are
              updated. Custom Fields and the section sheets are applied
              dynamically from your organization&apos;s active field
              definitions.
            </DialogDescription>
          </DialogHeader>

          <StepIndicator step={step} />

          {result.status === "error" && result.message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {result.message}
            </div>
          ) : null}

          {result.status === "success" ? (
            <div
              role="status"
              className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700"
            >
              {result.message}
            </div>
          ) : null}

          {step <= 1 ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="excel-file" className="text-sm font-medium">
                  Excel workbook (.xlsx)
                </label>
                <input
                  ref={inputRef}
                  id="excel-file"
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  disabled={busy}
                  onChange={(event) =>
                    pickFile(event.target.files?.[0] ?? null)
                  }
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Start from the downloadable template. Maximum 500 employees
                per import.
              </p>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="space-y-4">
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  <span className="font-medium">{result.totalRows}</span> total
                  rows
                </span>
                <span className="text-emerald-700">
                  <span className="font-medium">{result.createCount}</span> to
                  create
                </span>
                <span className="text-sky-700">
                  <span className="font-medium">{result.updateCount}</span> to
                  update
                </span>
                <span className="text-destructive">
                  <span className="font-medium">{result.errorCount}</span> with
                  errors
                </span>
              </div>
              {result.message ? (
                <p className="text-sm text-muted-foreground">
                  {result.message}
                </p>
              ) : null}
              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                {result.sheetNames.map((name) => (
                  <span
                    key={name}
                    className="rounded-full border border-border px-2 py-0.5"
                  >
                    {name}
                  </span>
                ))}
              </div>
              {result.previewErrors.length > 0 ? (
                <div className="max-h-56 overflow-auto rounded-md border border-destructive/40">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Validation errors</caption>
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="p-2 font-mono">Row</th>
                        <th className="p-2">Employee No.</th>
                        <th className="p-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.previewErrors.map((error, index) => (
                        <tr
                          key={`${error.rowNumber}-${index}`}
                          className="border-b border-border/60"
                        >
                          <td className="p-2 font-mono text-xs">
                            {error.rowNumber || "—"}
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {error.employeeNumber || "—"}
                          </td>
                          <td className="p-2 text-sm text-destructive">
                            {error.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700">
                  No validation errors — the workbook can be imported.
                </div>
              )}
            </div>
          ) : null}

          {step === 3 && result.status !== "success" ? (
            <p className="text-sm text-muted-foreground">
              Importing {importCount} row(s). Please keep this dialog open.
            </p>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {result.status === "success" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setOpen(false);
                  router.refresh();
                }}
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                {step >= 2 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      setResult(initialResult);
                      setStep(0);
                    }}
                  >
                    Re-upload
                  </Button>
                ) : null}
                {step <= 1 ? (
                  <Button
                    type="button"
                    disabled={!file || busy}
                    onClick={runPreview}
                  >
                    {busy ? "Validating..." : "Validate"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    disabled={
                      busy || result.errorCount > 0 || importCount === 0
                    }
                    onClick={runConfirm}
                  >
                    {busy
                      ? "Importing..."
                      : `Import ${importCount} record${
                          importCount === 1 ? "" : "s"
                        }`}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
