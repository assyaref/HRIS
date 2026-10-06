"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { notifier } from "@/lib/notifier";

import { Badge } from "@/components/ui/badge";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import {
  analyzeTestDataPurgeAction,
  purgeTestEmployeesAction,
  type TestDataPurgeState,
} from "./test-data-purge.actions";
import {
  TEST_DATA_PURGE_CONFIRMATION_PHRASE,
  matchesEmployeePurgeConfirmation,
  matchesPurgeConfirmationPhrase,
  purgeConfirmationPhraseFor,
} from "./test-data-purge-policy";

export interface PurgeableTestEmployee {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  employmentStatus: string;
}

/** The confirmation sentence block shown above the destructive button. */
function purgeWarning(employeeCount: number, recordCount: number) {
  if (employeeCount === 0) {
    return "Select at least one test employee to review what a purge would remove.";
  }
  if (employeeCount === 1) {
    return "This will permanently remove 1 test employee and about " +
      `${recordCount} related record${recordCount === 1 ? "" : "s"}. ` +
      "This cannot be undone and there is no recovery.";
  }
  return `This will permanently remove ${employeeCount} test employees and about ` +
    `${recordCount} related records. This cannot be undone and there is no recovery.`;
}

/**
 * Test Data Management (SUPERADMIN only).
 *
 * Two deliberate steps. The first is a READ-ONLY analysis that returns the
 * server-generated plan token and the full dependency breakdown; the second
 * executes the purge with that token. The operator therefore always reviews the
 * real, server-computed scope before anything destructive is enabled, and the
 * button is gated on a phrase the UI cannot verify alone — the server
 * re-validates every layer.
 */
export function TestDataPurgePanel({
  employees,
}: {
  employees: PurgeableTestEmployee[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);
  const [analysis, analyze, analyzing] = useActionState(
    analyzeTestDataPurgeAction,
    { status: "idle" } as TestDataPurgeState
  );
  const [purge, submitPurge, purging] = useActionState(
    purgeTestEmployeesAction,
    { status: "idle" } as TestDataPurgeState
  );

  // Typed phrase + acknowledgement, reset whenever the reviewed plan changes so
  // consent can never be carried over from a different selection.
  const [phrase, setPhrase] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [employeePhrases, setEmployeePhrases] = useState<Record<string, string>>(
    {}
  );

  /**
   * The token of the analysis the operator dismissed with "Cancel".
   *
   * Held rather than a boolean so that re-running the analysis on the same
   * selection reopens the dialog, and a stale dismissal cannot silently suppress
   * a newer plan.
   */
  const [dismissedToken, setDismissedToken] = useState<string | null>(null);
  const isBusy = analyzing || purging;

  // Derived, never stored: after a successful purge the refreshed list no
  // longer holds the purged ids, so they drop out of the selection here without
  // a `setState` inside the result effect.
  const activeSelection = selected.filter((employeeId) =>
    employees.some((employee) => employee.employeeId === employeeId)
  );

  /** Clear the consent fields so they can never carry to a different plan. */
  const resetConsent = () => {
    setPhrase("");
    setAcknowledged(false);
    setEmployeePhrases({});
  };

  const toggle = (employeeId: string) => {
    resetConsent();
    setSelected((current) =>
      current.includes(employeeId)
        ? current.filter((id) => id !== employeeId)
        : [...current, employeeId]
    );
  };

  const setSelection = (next: string[]) => {
    resetConsent();
    setSelected(next);
  };

  const allSelected =
    employees.length > 0 && activeSelection.length === employees.length;

  // The dialog's visibility is DERIVED from the analyzed token rather than
  // toggled by an effect: it is open exactly when there is an analysis the
  // operator has not dismissed and the purge has not already succeeded. A new
  // analysis produces a new token, so reviewing always reopens it, and a
  // successful purge closes it with no `setState` inside an effect.
  const analyzedToken = analysis.status === "analyzed" ? analysis.token : null;
  const dialogOpen =
    analyzedToken !== null &&
    dismissedToken !== analyzedToken &&
    purge.status !== "success";

  // Reporting the outcome is exactly what an effect is for: it pushes to an
  // external system (the toast) and refreshes the server-rendered list.
  useEffect(() => {
    if (purge.status === "success") {
      // The count is part of the message itself: `notifier` renders one string.
      notifier.success(
        `${purge.message} ${
          purge.removedRelatedRecords
        } related record${purge.removedRelatedRecords === 1 ? "" : "s"} removed.`
      );
      // After the refresh the purged rows are gone from `employees`, and
      // `activeSelection` is derived from the intersection, so the stale ids
      // drop out without a `setState` here.
      router.refresh();
      return;
    }
    if (purge.status === "error") {
      notifier.error(purge.message.split("\n")[0] ?? "Test data purge refused");
    }
  }, [purge.status, purge, router]);

  const blockReason =
    analysis.status === "analyzed" ? analysis.blockedMessage ?? null : null;

  // The destructive button requires all three layers: a reviewed plan with no
  // block, the exact phrase, and the per-employee phrase for every selection.
  const employeePhrasesSatisfied =
    analysis.status === "analyzed" &&
    analysis.selections.every((selection) =>
      matchesEmployeePurgeConfirmation(
        selection.employeeNumber,
        employeePhrases[selection.employeeId]
      )
    );
  const canPurge =
    analysis.status === "analyzed" &&
    !analysis.blockedCode &&
    matchesPurgeConfirmationPhrase(phrase) &&
    employeePhrasesSatisfied &&
    acknowledged;

  const runAnalysis = () => {
    // Step one is READ-ONLY: it computes the server-side plan and hands back the
    // token that step two must echo.
    const formData = new FormData();
    formData.set("employeeIds", activeSelection.join(","));
    analyze(formData);
  };

  const runPurge = () => {
    // Belt and braces: never fire a request the UI already knows must be
    // refused. The server enforces every one of these rules independently.
    if (!canPurge || analysis.status !== "analyzed") return;
    const formData = new FormData();
    formData.set(
      "employeeIds",
      analysis.selections.map((selection) => selection.employeeId).join(",")
    );
    formData.set("planToken", analysis.token);
    formData.set("confirmationPhrase", phrase);
    formData.set("acknowledgedPurge", "true");
    for (const value of Object.values(employeePhrases)) {
      formData.append("employeeConfirmations", value);
    }
    submitPurge(formData);
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-medium">
              Eligible test employees ({activeSelection.length}/{employees.length}{" "}
              selected)
            </p>
            <p className="text-xs text-muted-foreground">
              Only records identified as TEST data are listed. Production
              employees are never shown.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isBusy || employees.length === 0}
              onClick={() =>
                setSelection(
                  allSelected ? [] : employees.map((e) => e.employeeId)
                )
              }
            >
              {allSelected ? "Clear selection" : "Select all"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isBusy || activeSelection.length === 0}
              onClick={runAnalysis}
            >
              {analyzing ? "Analyzing…" : "Review purge"}
            </Button>
          </div>
        </div>

        {employees.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            No test employees were found in this organization. Test data is
            identified by an employee number starting with EMP-TEST-.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all test employees"
                    checked={allSelected}
                    disabled={isBusy}
                    onChange={() =>
                      setSelection(
                        allSelected ? [] : employees.map((e) => e.employeeId)
                      )
                    }
                  />
                </TableHead>
                <TableHead>Employee Number</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((employee) => (
                <TableRow key={employee.employeeId}>
                  <TableCell>
                    <input
                      type="checkbox"
                      aria-label={`Select ${employee.employeeNumber}`}
                      checked={activeSelection.includes(employee.employeeId)}
                      disabled={isBusy}
                      onChange={() => toggle(employee.employeeId)}
                    />
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {employee.employeeNumber}
                  </TableCell>
                  <TableCell>{employee.employeeName}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {employee.employmentStatus}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      {purge.status === "error" && purge.message ? (
        <div
          role="alert"
          className="whitespace-pre-line rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {purge.message}
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        onOpenChange={(next) => {
          if (next) return;
          setDismissedToken(analyzedToken);
          resetConsent();
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>PURGE TEST DATA</DialogTitle>
            <DialogDescription>
              Review the server-generated plan before continuing.
            </DialogDescription>
          </DialogHeader>

          {analysis.status === "analyzed" ? (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
                <p className="font-medium text-destructive">
                  {purgeWarning(
                    analysis.selections.length,
                    analysis.totalDeletableRecords
                  )}
                </p>
              </div>

              {blockReason ? (
                <div
                  role="alert"
                  className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {blockReason}
                </div>
              ) : null}

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Selected records ({analysis.selections.length})
                </p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                  {analysis.selections.map((selection) => (
                    <li key={selection.employeeId} className="flex justify-between gap-3">
                      <span className="font-mono text-xs">
                        {selection.employeeNumber}
                      </span>
                      <span className="text-muted-foreground">
                        {selection.employeeName} ·{" "}
                        {selection.deletableRecordCount} related record
                        {selection.deletableRecordCount === 1 ? "" : "s"}
                        {selection.blocked ? " · BLOCKED" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
                {analysis.directReportCount > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {analysis.directReportCount} direct report
                    {analysis.directReportCount === 1 ? "" : "s"} outside this
                    selection will be reviewed before anything is removed.
                  </p>
                ) : null}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Type <span className="font-mono">{TEST_DATA_PURGE_CONFIRMATION_PHRASE}</span> to confirm
                </p>
                <Input
                  value={phrase}
                  onChange={(event) => setPhrase(event.target.value)}
                  placeholder={TEST_DATA_PURGE_CONFIRMATION_PHRASE}
                  autoComplete="off"
                  disabled={isBusy}
                  aria-label="Purge confirmation phrase"
                />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">
                  Confirm each employee
                </p>
                {analysis.selections.map((selection) => (
                  <div key={selection.employeeId} className="space-y-1">
                    <label
                      htmlFor={`purge-confirm-${selection.employeeId}`}
                      className="text-xs text-muted-foreground"
                    >
                      {selection.employeeNumber}
                    </label>
                    <Input
                      id={`purge-confirm-${selection.employeeId}`}
                      value={employeePhrases[selection.employeeId] ?? ""}
                      onChange={(event) =>
                        setEmployeePhrases((current) => ({
                          ...current,
                          [selection.employeeId]: event.target.value,
                        }))
                      }
                      placeholder={purgeConfirmationPhraseFor(
                        selection.employeeNumber
                      )}
                      autoComplete="off"
                      disabled={isBusy}
                    />
                  </div>
                ))}
              </div>

              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                  disabled={isBusy}
                />
                <span>
                  I understand this permanently removes production data and
                  cannot be undone.
                </span>
              </label>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDismissedToken(analyzedToken);
                resetConsent();
              }}
              disabled={purging}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={purging || !canPurge}
              aria-disabled={purging || !canPurge}
              onClick={runPurge}
            >
              {purging ? "Purging…" : "Purge test data"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
