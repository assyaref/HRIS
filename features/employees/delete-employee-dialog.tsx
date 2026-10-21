"use client";

import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";

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
import { Input } from "@/components/ui/input";

import {
  checkEmployeeDeletionDependenciesAction,
  permanentlyDeleteEmployeeAction,
  type EmployeePermanentDeleteState,
} from "./actions";
import { EmployeeStatusBadge } from "./employee-status-badge";
import type { EmployeeStatus } from "./constants";
import {
  EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
  matchesEmployeeNumberConfirmation,
  totalEmployeeDeleteDependencyCount,
  type EmployeeDeleteDependency,
} from "./permanent-delete-policy";
import {
  DELETION_ACTIVE_REQUEST_MESSAGE,
  DELETION_LEGAL_HOLD_MESSAGE,
  DELETION_REASON_MAX_LENGTH,
  DELETION_REASON_MIN_LENGTH,
  isValidDeletionReason,
} from "./deletion-control-policy";

const initialState: EmployeePermanentDeleteState = { status: "idle" };

/** Identity shown in the confirmation dialog. */
export interface PermanentDeleteEmployeeTarget {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: EmployeeStatus;
  department?: string | null;
  position?: string | null;
}

interface EmployeePermanentDeleteDialogProps {
  employee: PermanentDeleteEmployeeTarget;
  /**
   * The organization this employee belongs to (the listing's validated tenant,
   * or the owning organization of the detail page). Threaded into the server
   * action where it is treated as a consistency assertion only — the action
   * re-derives the OWNING organization from the database and never trusts this
   * value as a lookup key.
   */
  organizationId: string;
  /** Page to land on after a successful delete (detail → list). */
  redirectTo?: string;
  /** Renders the trigger as a full destructive button instead of a row action. */
  variant?: "row" | "button";
}

/** Dependency pre-flight as the dialog consumes it. */
type DependencyCheckState =
  | { status: "idle" | "loading" }
  | {
      status: "ready" | "error";
      dependencies: EmployeeDeleteDependency[];
      protectedDependencies: EmployeeDeleteDependency[];
      deletableDependencies: EmployeeDeleteDependency[];
      totalRelatedRecords: number;
      directReportCount: number;
      legalHoldActive: boolean;
      blockingDeletionRequestCount: number;
      message?: string;
    };

const idleDependencyCheck: DependencyCheckState = { status: "idle" };

/**
 * The single permanent-deletion flow, shared by the employee list and the
 * employee detail page.
 *
 * Rendered ONLY for callers entitled to `employees.permanent_delete` (the
 * system-level SUPER Administrator). That is a UX affordance only: the
 * authorization, the organization scope, both confirmation layers, the
 * protected-record classification and the transaction all live in
 * `permanentlyDeleteEmployeeAction`, so a direct call from any other role is
 * refused server-side. A Super Administrator may use this flow for another
 * tenant's employee (listed under that tenant); the action re-derives the
 * record's owning organization from the database.
 *
 * RETENTION-COMPATIBLE COMPLETION (approved detach schema, migration 0022):
 * PROTECTED historical records (attendance, leave, permission, payroll,
 * payslip, employment history) are RETAINED — never deleted — and no longer
 * block the deletion: the transaction freezes their identity snapshots and
 * the database detaches their employee reference when the employee row is
 * removed. The dialog still requires, before the request is sent:
 * 1. the typed Employee Number matches exactly, character for character;
 * 2. the read-only pre-flight has arrived (a pending or failed report keeps
 *    the button disabled — fail closed);
 * 3. "I understand that this action cannot be undone." is ticked;
 * 4. a deletion reason of at least 10 characters is supplied — re-validated
 *    server-side and recorded on the permanent-delete audit trail.
 *
 * The dialog shows the records that WILL be deleted (deletable categories),
 * those that will be RETAINED (protected categories, direct reports) and,
 * after the server responds, the FINAL RESULT of the transaction (removed
 * and retained records, or the exact refusal). If the deployed schema does
 * not yet include the detach change, the server's retained-completion error
 * explains that nothing was deleted.
 */
export function EmployeePermanentDeleteDialog({
  employee,
  organizationId,
  redirectTo = "/employees",
  variant = "row",
}: EmployeePermanentDeleteDialogProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [reason, setReason] = useState("");
  const handledSuccess = useRef(false);
  const [dependencyCheck, setDependencyCheck] =
    useState<DependencyCheckState>(idleDependencyCheck);
  const [state, formAction, isPending] = useActionState(
    permanentlyDeleteEmployeeAction.bind(null, employee.id, organizationId),
    initialState
  );

  // Read-only pre-flight: counted server-side, org-scoped, never audited and
  // never a delete request. A stale or failed report must not enable the
  // button, so every open starts from "idle" and re-runs the check.
  const runDependencyCheck = useCallback(async () => {
    setDependencyCheck({ status: "loading" });
    try {
      const report = await checkEmployeeDeletionDependenciesAction(
        employee.id,
        organizationId
      );
      setDependencyCheck({
        status: report.status === "success" ? "ready" : "error",
        dependencies: report.dependencies,
        protectedDependencies: report.protectedDependencies,
        deletableDependencies: report.deletableDependencies,
        totalRelatedRecords: report.totalRelatedRecords,
        directReportCount: report.directReportCount,
        legalHoldActive: report.legalHoldActive,
        blockingDeletionRequestCount: report.blockingDeletionRequestCount,
        message:
          report.status === "success"
            ? undefined
            : (report.message ?? EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE),
      });
    } catch {
      setDependencyCheck({
        status: "error",
        dependencies: [],
        protectedDependencies: [],
        deletableDependencies: [],
        totalRelatedRecords: 0,
        directReportCount: 0,
        legalHoldActive: false,
        blockingDeletionRequestCount: 0,
        message: EMPLOYEE_PERMANENT_DELETE_FAILED_MESSAGE,
      });
    }
  }, [employee.id, organizationId]);

  // Opening the dialog is an event, so the pre-flight fires from the open
  // handlers — never from an effect — and the report is reset before the
  // request starts. While the report is pending or has failed, the confirm
  // button stays disabled (fail closed).
  function openDialog() {
    setConfirmation("");
    setAcknowledged(false);
    setReason("");
    setDependencyCheck(idleDependencyCheck);
    setOpen(true);
    void runDependencyCheck();
  }

  const confirmationMatches = matchesEmployeeNumberConfirmation(
    employee.employeeNumber,
    confirmation
  );
  // The pre-flight report is preferred; the last rejection's counts are the
  // fallback so the summary is never rendered empty while the action is
  // refused.
  const reportedDependencies: readonly EmployeeDeleteDependency[] =
    dependencyCheck.status === "ready" || dependencyCheck.status === "error"
      ? dependencyCheck.dependencies
      : [];
  const reportedProtected: readonly EmployeeDeleteDependency[] =
    dependencyCheck.status === "ready" || dependencyCheck.status === "error"
      ? dependencyCheck.protectedDependencies
      : [];
  // RETAINED records: protected history that is never deleted. Under the
  // revised policy their presence does NOT disable the button — the Super
  // Administrator may attempt the deletion, and the server (backed by the
  // database's RESTRICT foreign keys) decides whether it can complete.
  const retainedSummary: readonly EmployeeDeleteDependency[] =
    reportedProtected.length > 0
      ? reportedProtected
      : (state.retainedDependencies ?? []);
  const hasRetainedRecords = retainedSummary.length > 0;
  const deletableSummary: readonly EmployeeDeleteDependency[] =
    dependencyCheck.status === "ready"
      ? dependencyCheck.deletableDependencies
      : (state.deletableDependencies ?? []);
  const dependencyCheckPending = dependencyCheck.status === "loading";
  const totalRelatedRecords =
    dependencyCheck.status === "ready"
      ? dependencyCheck.totalRelatedRecords
      : totalEmployeeDeleteDependencyCount(reportedDependencies);
  const directReportCount =
    dependencyCheck.status === "ready" ? dependencyCheck.directReportCount : 0;
  const legalHoldActive =
    dependencyCheck.status === "ready" && dependencyCheck.legalHoldActive;
  const blockingDeletionRequestCount =
    dependencyCheck.status === "ready"
      ? dependencyCheck.blockingDeletionRequestCount
      : 0;
  // Fail closed: the destructive button is enabled only when the pre-flight
  // report ARRIVED, the number matches exactly, the irreversibility
  // checkbox is ticked, AND a valid audit-policy reason is supplied. A
  // pending or failed report is never "ready", so it keeps the button
  // disabled. Protected records do not disable it.
  const reasonValid = isValidDeletionReason(reason);
  const canSubmitDelete =
    confirmationMatches &&
    acknowledged &&
    reasonValid &&
    dependencyCheck.status === "ready" &&
    !legalHoldActive &&
    blockingDeletionRequestCount === 0;
  const displayName = `${employee.firstName} ${employee.lastName}`;
  const role = [employee.department, employee.position]
    .filter((value): value is string => Boolean(value))
    .join(" — ");
  // A committed deletion invalidates this view; the dialog stays open on
  // success to show the FINAL RESULT of the transaction (removed + retained
  // records), and the Close button performs the redirect.
  const dialogOpen = open;

  function reset() {
    setConfirmation("");
    setAcknowledged(false);
    setReason("");
    setOpen(false);
    // Clearing the report here (an event handler) keeps a stale one from
    // re-disabling or re-enabling the next open.
    setDependencyCheck(idleDependencyCheck);
  }

  // A committed deletion also invalidates the route: refresh the data behind
  // the dialog immediately, and land on the redirect target once the operator
  // has read the final result.
  useEffect(() => {
    if (state.status !== "success" || handledSuccess.current) return;
    handledSuccess.current = true;
    notifier.success(
      state.message ?? "Employee permanently deleted successfully."
    );
    router.refresh();
  }, [state, router]);

  function closeFinalResult() {
    router.replace(redirectTo);
    reset();
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size={variant === "button" ? "md" : "sm"}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={openDialog}
        aria-label={`Permanently delete ${displayName}`}
      >
        Permanent Delete
      </Button>

      <Dialog
        open={dialogOpen}
        onOpenChange={(nextOpen) => {
          if (isPending) return;
          if (nextOpen) {
            openDialog();
            return;
          }
          // Closing after a committed deletion (ESC/overlay) takes the same
          // path as the final-result Close button so the redirect happens.
          if (state.status === "success") {
            closeFinalResult();
            return;
          }
          reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">
              Permanent Delete Employee?
            </DialogTitle>
            <DialogDescription>
              This action permanently deletes this employee and eligible
              related records. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 p-4">
              <div className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
                <span className="text-muted-foreground">Name</span>
                <span className="truncate font-medium">{displayName}</span>

                <span className="text-muted-foreground">
                  Employee Number
                </span>
                <span className="truncate font-mono text-xs">
                  {employee.employeeNumber}
                </span>

                <span className="text-muted-foreground">Status</span>
                <span>
                  <EmployeeStatusBadge status={employee.employmentStatus} />
                </span>

                {role ? (
                  <>
                    <span className="text-muted-foreground">
                      Department / Position
                    </span>
                    <span className="truncate">{role}</span>
                  </>
                ) : null}
              </div>
            </div>

            {/* Related-record report: the operator sees the real figures before
                committing, split by disposition. */}
            <div
              className="space-y-2 rounded-md border border-border bg-muted/40 p-3"
              data-testid="permanent-delete-dependency-report"
            >
              <p className="text-xs font-medium text-muted-foreground">
                Related records
              </p>
              {dependencyCheckPending ? (
                <p className="text-sm text-muted-foreground">
                  Checking related records…
                </p>
              ) : null}

              {dependencyCheck.status === "ready" ? (
                <p className="text-sm text-muted-foreground">
                  Total related records:{" "}
                  <span className="font-mono font-medium">
                    {totalRelatedRecords}
                  </span>
                </p>
              ) : null}

              {deletableSummary.length > 0 ? (
                <ul className="space-y-1">
                  {deletableSummary.map((dependency) => (
                    <li
                      key={dependency.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span>
                        {dependency.label}{" "}
                        <span className="text-xs text-muted-foreground">
                          (will be deleted)
                        </span>
                      </span>
                      <span className="font-mono font-medium">
                        {dependency.count}
                      </span>
                    </li>
                  ))}
                  {directReportCount > 0 ? (
                    <li className="flex items-start justify-between gap-3 text-sm">
                      <span>
                        Direct reports{" "}
                        <span className="text-xs text-muted-foreground">
                          (retained — their manager link will be cleared)
                        </span>
                      </span>
                      <span className="font-mono font-medium">
                        {directReportCount}
                      </span>
                    </li>
                  ) : null}
                </ul>
              ) : null}

              {dependencyCheck.status === "ready" &&
              deletableSummary.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No deletable related records were found.
                </p>
              ) : null}

              {hasRetainedRecords ? (
                <div className="space-y-2" data-testid="permanent-delete-retained-summary">
                  <p className="text-xs font-medium text-muted-foreground">
                    Retained records (never deleted)
                  </p>
                  <ul className="space-y-1">
                    {retainedSummary.map((dependency) => (
                      <li
                        key={dependency.label}
                        className="flex items-center justify-between gap-3 text-sm"
                      >
                        <span>
                          {dependency.label}{" "}
                          <span className="text-xs text-muted-foreground">
                            (retained for legal and audit purposes)
                          </span>
                        </span>
                        <span className="font-mono font-medium">
                          {dependency.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    Protected historical records are retained for legal and
                    audit purposes and are never deleted, not even by a Super
                    Administrator. The transaction stores their historical
                    identity (employee number and name) on each retained row
                    and removes only the link to the employee record, so
                    reports and payroll history stay complete.
                  </p>
                </div>
              ) : null}

              {legalHoldActive ? (
                <p className="text-sm text-destructive">
                  {DELETION_LEGAL_HOLD_MESSAGE} Delete is disabled.
                </p>
              ) : null}

              {blockingDeletionRequestCount > 0 ? (
                <p className="text-sm text-destructive">
                  {DELETION_ACTIVE_REQUEST_MESSAGE} Delete is disabled.
                </p>
              ) : null}

              {dependencyCheck.status === "error" ? (
                <p className="text-sm text-destructive">
                  {dependencyCheck.message} Delete stays disabled — reload and
                  try again.
                </p>
              ) : null}
            </div>

            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
              <p className="font-medium text-destructive">
                This action cannot be undone.
              </p>
              <p className="mt-1 text-destructive/90">
                Permanent deletion will remove this employee and eligible
                related records in a single transaction.
              </p>
              <p className="mt-1 text-destructive/90">
                Protected historical records, if any, will not be deleted.
              </p>
            </div>

            <p className="text-sm font-medium">
              Type the Employee Number to confirm
            </p>

            <div className="space-y-2">
              <label
                htmlFor={`delete-employee-number-${employee.id}`}
                className="text-xs text-muted-foreground"
              >
                Employee Number
              </label>
              <Input
                id={`delete-employee-number-${employee.id}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder={employee.employeeNumber}
                autoComplete="off"
                autoFocus
                disabled={isPending}
                aria-describedby={`delete-employee-number-help-${employee.id}`}
              />
              <p
                id={`delete-employee-number-help-${employee.id}`}
                className="text-xs text-muted-foreground"
              >
                Type exactly{" "}
                <span className="font-mono font-medium">
                  {employee.employeeNumber}
                </span>{" "}
                to enable deletion.
              </p>
            </div>

            <div className="space-y-2">
              <label
                htmlFor={`delete-employee-reason-${employee.id}`}
                className="text-xs text-muted-foreground"
              >
                Reason for deletion (required)
              </label>
              <textarea
                id={`delete-employee-reason-${employee.id}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                rows={3}
                maxLength={DELETION_REASON_MAX_LENGTH}
                placeholder="Why is this employee being permanently deleted?"
                disabled={isPending}
                data-testid="permanent-delete-reason"
                aria-describedby={`delete-employee-reason-help-${employee.id}`}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
              <p
                id={`delete-employee-reason-help-${employee.id}`}
                className="text-xs text-muted-foreground"
              >
                Recorded on the permanent-delete audit trail. At least{" "}
                {DELETION_REASON_MIN_LENGTH} characters.
              </p>
            </div>

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                disabled={isPending}
                className="mt-0.5"
                data-testid="permanent-delete-acknowledgement"
              />
              <span>
                I understand that this action cannot be undone. Are you
                absolutely sure?
              </span>
            </label>

            {state.status === "error" && state.message ? (
              <div
                role="alert"
                className="whitespace-pre-line rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                {state.message}
              </div>
            ) : null}

            {state.status === "success" ? (
              <div
                className="space-y-2 rounded-md border border-emerald-600/40 bg-emerald-500/5 px-3 py-2 text-sm"
                data-testid="permanent-delete-final-result"
              >
                <p className="font-medium text-emerald-700">
                  {displayName} ({employee.employeeNumber}) was permanently
                  deleted.
                </p>
                <p className="text-xs font-medium text-muted-foreground">
                  Final result of the transaction
                </p>
                {state.removedSummary &&
                Object.keys(state.removedSummary).length > 0 ? (
                  <ul className="space-y-1">
                    {Object.entries(state.removedSummary).map(
                      ([label, count]) => (
                        <li
                          key={label}
                          className="flex items-center justify-between gap-3"
                        >
                          <span>
                            {label}{" "}
                            <span className="text-xs text-muted-foreground">
                              (deleted)
                            </span>
                          </span>
                          <span className="font-mono font-medium">{count}</span>
                        </li>
                      )
                    )}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No related records had to be removed.
                  </p>
                )}
                {state.retainedDependencies &&
                state.retainedDependencies.length > 0 ? (
                  <ul className="space-y-1">
                    {state.retainedDependencies.map((dependency) => (
                      <li
                        key={dependency.label}
                        className="flex items-center justify-between gap-3"
                      >
                        <span>
                          {dependency.label}{" "}
                          <span className="text-xs text-muted-foreground">
                            (retained with its historical identity)
                          </span>
                        </span>
                        <span className="font-mono font-medium">
                          {dependency.count}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-muted-foreground">
                    No historical records had to be retained.
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <DialogFooter>
            {state.status === "success" ? (
              <Button
                type="button"
                variant="outline"
                onClick={closeFinalResult}
                data-testid="permanent-delete-final-result-close"
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  disabled={isPending}
                  onClick={reset}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={isPending || !canSubmitDelete}
                  aria-disabled={isPending || !canSubmitDelete}
                  onClick={() => {
                    // Belt and braces: never fire a request the UI already knows
                    // must be refused. The server enforces the same rules.
                    if (!canSubmitDelete) return;
                    const formData = new FormData();
                    formData.set("confirmEmployeeNumber", confirmation);
                    formData.set("acknowledgedPermanentDelete", "true");
                    formData.set("deletionReason", reason);
                    formAction(formData);
                  }}
                >
                  {isPending ? "Deleting…" : "Permanently Delete Employee"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}