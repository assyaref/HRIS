"use client";

import { useState } from "react";
import { useTransition } from "react";

import { notifier } from "@/lib/notifier";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { EmployeeStatusBadge } from "../employee-status-badge";
import {
  importEmployeesAction,
  type ImportResult,
} from "./import-action";

const initialState: ImportResult = {
  status: "idle",
  validRows: [],
  errorRows: [],
  totalRows: 0,
  validCount: 0,
  errorCount: 0,
};

function formatDate(value: string | null): string {
  return value ?? "—";
}

/**
 * "Import employees" flow (client leaf).
 *
 * Phase 1 — the user picks a CSV and presses "Preview CSV". The server
 * parses + validates every row (limit 500) and returns a review preview
 * without writing anything.
 *
 * Phase 2 — "Import N records" sends the confirmed preview rows back as
 * JSON; the server re-validates them, re-checks organization duplicates and
 * inserts everything inside ONE transaction (any failure rolls back).
 *
 * RBAC: the server re-checks `employees.create` on every dispatch.
 */
export function ImportEmployeesDialog() {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult>(initialState);
  const [isPending, startTransition] = useTransition();

  const { status } = result;
  const canImport = status === "preview" && result.validCount > 0;

  function openWithWarning() {
    notifier.warning(
      "Imported employees are permanent and cannot be undone. Review the CSV preview before importing."
    );
    setResult(initialState);
    setFile(null);
    setOpen(true);
  }

  function submit(payload: FormData) {
    startTransition(async () => {
      const next = await importEmployeesAction(initialState, payload);
      setResult(next);
      if (next.status === "success") {
        notifier.success(next.message ?? "Employees imported successfully.");
      }
    });
  }

  function preview() {
    if (!file) {
      setResult({
        ...initialState,
        status: "error",
        message: "No file selected.",
      });
      return;
    }
    const payload = new FormData();
    payload.append("csvFile", file);
    submit(payload);
  }

  function confirm() {
    const payload = new FormData();
    payload.append("mode", "confirm");
    payload.append("rows", JSON.stringify(result.validRows));
    submit(payload);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={openWithWarning}
        aria-label="Import employees from CSV"
      >
        Import employees
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import employees</DialogTitle>
            <DialogDescription>
              Upload a CSV file with employee data. Rows are validated before
              anything is written; the import is all-or-nothing.
            </DialogDescription>
          </DialogHeader>

          {status === "error" && result.message ? (
            <div
              role="alert"
              className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {result.message}
            </div>
          ) : null}

          {status === "success" ? (
            <div
              role="status"
              className="rounded-md border border-emerald-600/40 bg-emerald-600/10 px-3 py-2 text-sm text-emerald-700"
            >
              {result.message}
            </div>
          ) : null}

          {status === "idle" || status === "error" ? (
            <div className="space-y-4 p-1">
              <div className="space-y-2">
                <label
                  htmlFor="import-csv-file"
                  className="text-sm font-medium"
                >
                  CSV file
                </label>
                <input
                  id="import-csv-file"
                  name="csvFile"
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => {
                    const selected = event.target.files?.[0] ?? null;
                    setFile(selected);
                    setResult(initialState);
                  }}
                  className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary/10 file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Required columns: Employee No., Name, Email, Hire Date
                (YYYY-MM-DD), Status (active/inactive). Maximum{" "}
                <span className="font-medium">500 rows</span> per import.
              </p>
            </div>
          ) : null}

          {status === "preview" ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-muted-foreground">
                {result.validCount} ready, {result.errorCount} need attention of{" "}
                {result.totalRows} total.
              </p>

              {result.validRows.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-md border border-border">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Valid rows</caption>
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="p-2 font-mono">Row</th>
                        <th className="p-2 font-medium">Employee No.</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">Hire date</th>
                        <th className="p-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.validRows.map((row) => (
                        <tr
                          key={`v-${row.rowNumber}`}
                          className="border-b border-border/60"
                        >
                          <td className="p-2 font-mono text-xs">
                            {row.rowNumber}
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {row.employeeNumber}
                          </td>
                          <td className="p-2">
                            {row.firstName} {row.lastName}
                          </td>
                          <td className="p-2">{row.email ?? "—"}</td>
                          <td className="p-2">{formatDate(row.hireDate)}</td>
                          <td className="p-2">
                            {row.status ? (
                              <EmployeeStatusBadge status={row.status} />
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {result.errorRows.length > 0 ? (
                <div className="max-h-64 overflow-auto rounded-md border border-destructive/40">
                  <table className="w-full text-sm">
                    <caption className="sr-only">Errors by row</caption>
                    <thead className="sticky top-0 bg-card">
                      <tr className="border-b border-border text-left text-xs text-muted-foreground">
                        <th className="p-2 font-mono">Row</th>
                        <th className="p-2 font-medium">Employee No.</th>
                        <th className="p-2">Name</th>
                        <th className="p-2">Email</th>
                        <th className="p-2">Status</th>
                        <th className="p-2">Error</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.errorRows.map((row) => (
                        <tr
                          key={`e-${row.rowNumber}`}
                          className="border-b border-border/60"
                        >
                          <td className="p-2 font-mono text-xs">
                            {row.rowNumber}
                          </td>
                          <td className="p-2 font-mono text-xs">
                            {row.employeeNumber ?? "—"}
                          </td>
                          <td className="p-2">
                            {[row.firstName, row.lastName]
                              .filter(Boolean)
                              .join(" ") || "—"}
                          </td>
                          <td className="p-2">{row.email ?? "—"}</td>
                          <td className="p-2 text-xs text-muted-foreground">
                            {row.statusRaw ?? "—"}
                          </td>
                          <td className="p-2 text-sm text-destructive">
                            {row.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            {status === "success" ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => setOpen(false)}
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                {status === "preview" ? (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!canImport || isPending}
                    onClick={confirm}
                  >
                    {isPending
                      ? "Importing..."
                      : `Import ${result.validCount} record${
                          result.validCount === 1 ? "" : "s"
                        }`}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    disabled={!file || isPending}
                    onClick={preview}
                  >
                    {isPending ? "Previewing..." : "Preview CSV"}
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