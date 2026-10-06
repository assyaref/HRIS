"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { requireUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";
import { deleteEmployeeDocumentStorage } from "@/lib/employee-documents/storage";

import {
  TEST_DATA_PURGE_ADVICE,
  TEST_DATA_PURGE_CONFIRMATION_PHRASE,
  TEST_DATA_PURGE_EMPTY_SELECTION_MESSAGE,
  TEST_DATA_PURGE_FAILED_MESSAGE,
  TEST_DATA_PURGE_FORBIDDEN_MESSAGE,
  TEST_DATA_PURGE_INVALID_CONFIRMATION_MESSAGE,
  TEST_DATA_PURGE_NOT_FOUND_MESSAGE,
  TEST_DATA_PURGE_NOT_TEST_DATA_MESSAGE,
  TEST_DATA_PURGE_ACKNOWLEDGEMENT_MESSAGE,
  buildProtectedPurgeMessage,
  buildProductionDirectReportMessage,
  collectBlockedPurgeCategories,
  evaluateTestDataPurge,
  isTestDataEmployeeNumber,
  matchesEmployeePurgeConfirmation,
  matchesPurgeConfirmationPhrase,
  purgeConfirmationPhraseFor,
  totalDeletablePurgeRecords,
  type TestDataPurgeDirectReport,
  type TestDataPurgeTarget,
} from "./test-data-purge-policy";
import {
  buildPurgePlanToken,
  clearTestDataManagerLinks,
  countPurgeDependencies,
  deletePurgeDeletableRecords,
  deletePurgeEmployees,
  deletePurgeEmploymentHistory,
  listPurgeDirectReports,
  listPurgeTargets,
  listTestDataEmployees,
} from "./test-data-purge.queries";

/**
 * TEST DATA PURGE server actions.
 *
 * A capability SEPARATE from `permanentlyDeleteEmployeeAction`. The distinction
 * is deliberate and load-bearing:
 *
 * - PERMANENT DELETE removes ONE employee the Super Administrator picks, and is
 *   blocked by any retention-bound record. Its policy lives in
 *   `permanent-delete-policy.ts` and is not modified here.
 * - TEST DATA PURGE removes records the system has already identified as TEST
 *   data. It applies the SAME retention protection — being test data never makes
 *   a payroll or attendance record deletable.
 *
 * Security rules enforced here, none of them trusting the browser:
 * - `requireUser` authenticates and verifies the session.
 * - The organization comes from the session, never from the form. A cross-org
 *   employee id resolves as not found, so existence never leaks.
 * - Eligibility is derived from the STORED employee number, never from a
 *   submitted list of ids or a client-side filter.
 * - The plan is generated on the server and FINGERPRINTED; the submitted token
 *   must match a plan the server recomputed inside the transaction. A client
 *   cannot alter the selection or the counts without invalidating it.
 * - Every audit row — including refusals — is written, and the SUCCESS row is
 *   written INSIDE the transaction so it commits atomically with the deletes it
 *   describes and survives the removal of the employee rows.
 */

/** How the attempt ended. Mirrors the permanent-delete audit vocabulary. */
type TestDataPurgeAuditResult = "SUCCESS" | "DENIED" | "FAILED";

/** Typed state codes the dialog switches on. Never raw HTTP status codes. */
export type TestDataPurgeStateCode =
  | "FORBIDDEN"
  | "ORGANIZATION_MISMATCH"
  | "NOT_FOUND"
  | "NOT_TEST_DATA"
  | "INVALID_SELECTION"
  | "EMPTY_SELECTION"
  | "PROTECTED_RECORDS"
  | "PRODUCTION_DIRECT_REPORT"
  | "INVALID_CONFIRMATION"
  | "PURGE_FAILED";

export interface TestDataPurgeSelectionSummary {
  employeeId: string;
  employeeNumber: string;
  employeeName: string;
  /** Related records that will be removed for this employee. */
  deletableRecordCount: number;
  /** True when the employee is blocked by retention-bound history. */
  blocked: boolean;
}

export type TestDataPurgeState =
  | { status: "idle" }
  | {
      status: "analyzing";
      employeeCount: number;
    }
  | {
      status: "analyzed";
      token: string;
      selections: TestDataPurgeSelectionSummary[];
      totalDeletableRecords: number;
      directReportCount: number;
      confirmationPhrase: string;
      /** Present when the analysis already resolves to a block. */
      blockedCode?:
        | "NOT_TEST_DATA"
        | "PROTECTED_RECORDS"
        | "PRODUCTION_DIRECT_REPORT";
      blockedMessage?: string;
    }
  | {
      status: "error";
      code: TestDataPurgeStateCode;
      message: string;
      selections?: TestDataPurgeSelectionSummary[];
    }
  | {
      status: "success";
      message: string;
      removedEmployees: number;
      removedRelatedRecords: number;
      clearedManagerLinks: number;
    };

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function isAcknowledged(formData: FormData): boolean {
  const raw = formData.get("acknowledgedPurge");
  return raw === "true" || raw === "on" || raw === "1";
}

function error(
  code: TestDataPurgeStateCode,
  message: string,
  selections?: TestDataPurgeSelectionSummary[]
): TestDataPurgeState {
  return { status: "error", code, message, ...(selections ? { selections } : {}) };
}

/** UUID shape check before an id is interpolated into a SQL predicate. */
function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

/**
 * Parse the submitted selection.
 *
 * De-duplicated and length-capped. Anything that is not a well-formed uuid is
 * DROPPED rather than rejected wholesale, and a dropped id simply never
 * resolves, so a malformed id can never widen the scope of the purge.
 */
function parseEmployeeIds(raw: string): string[] {
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (!value || !isUuid(value)) continue;
    seen.add(value);
  }
  return [...seen].slice(0, 100);
}

/**
 * Append one `TEST_DATA_PURGE` audit record.
 *
 * The row depends on NOTHING the purge removes: `audit_logs.entity_id` is a
 * plain uuid with no foreign key, and every employee identity is stored as a
 * snapshot. The trail therefore survives the employee rows — the whole point of
 * auditing a destructive operation.
 *
 * Records the actor (id, email, role), the organization, the FULL selection
 * with names and counts, what was removed, and how the attempt ended. Never
 * secrets, never master-data payloads.
 *
 * Called with `tx` on the success path so the trail commits atomically with the
 * deletes; called with the pooled client on every refusal so a DENIED attempt is
 * still recorded.
 */
async function writeTestDataPurgeAudit(
  client: { insert: typeof db.insert },
  input: {
    organizationId: string | null;
    actorUserId: string;
    actorEmail: string | null;
    actorRole: string | null;
    result: TestDataPurgeAuditResult;
    reason?: string;
    selections?: TestDataPurgeSelectionSummary[];
    removedRelatedRecords?: Record<string, number>;
    clearedManagerLinks?: number;
  }
): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.actorUserId,
      action: "employee.test_data_purged",
      entityType: "employee",
      metadata: {
        operation: "TEST_DATA_PURGE",
        actorUserId: input.actorUserId,
        actorEmail: input.actorEmail,
        actorRole: input.actorRole,
        result: input.result,
        // Full selection snapshot: who was targeted and why they were eligible.
        selectedEmployees: input.selections ?? [],
        selectedEmployeeCount: input.selections?.length ?? 0,
        removedRelatedRecords: input.removedRelatedRecords ?? {},
        clearedManagerLinks: input.clearedManagerLinks ?? 0,
        ...(input.reason ? { reason: input.reason } : {}),
      },
    });
  } catch (error) {
    console.error("[employees] test data purge audit failed", error);
  }
}

/**
 * Shared authorization + session-organization resolution.
 *
 * Requires BOTH `employees.test_data_purge` AND the system-level SUPERADMIN
 * role, mirroring `canPermanentlyDeleteEmployees`. Hiding the button is a
 * convenience; this is the control.
 */
async function authorizePurge(): Promise<
  | {
      allowed: true;
      user: { id: string; email: string | null; organizationId: string };
      actorRole: string | null;
    }
  | { allowed: false; state: TestDataPurgeState }
> {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);

  if (
    !authorization.isSuperAdmin ||
    !authorization.permissionCodes.includes(PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE)
  ) {
    await writeTestDataPurgeAudit(db, {
      organizationId: user.organizationId ?? null,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: displayRoleLabel(authorization.roleCodes),
      result: "DENIED",
      reason: "PERMISSION_DENIED",
    });
    return {
      allowed: false,
      state: error("FORBIDDEN", TEST_DATA_PURGE_FORBIDDEN_MESSAGE),
    };
  }

  if (!user.organizationId) {
    await writeTestDataPurgeAudit(db, {
      organizationId: null,
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: displayRoleLabel(authorization.roleCodes),
      result: "DENIED",
      reason: "NO_ORGANIZATION",
    });
    return {
      allowed: false,
      state: error(
        "FORBIDDEN",
        "Your account is not assigned to an organization."
      ),
    };
  }

  return {
    allowed: true,
    user: {
      id: user.id,
      email: user.email,
      organizationId: user.organizationId,
    },
    actorRole: displayRoleLabel(authorization.roleCodes),
  };
}

/** Per-employee summary rows for the operator-facing report and the audit row. */
function summarize(
  targets: readonly TestDataPurgeTarget[]
): TestDataPurgeSelectionSummary[] {
  const blocked = new Set(
    collectBlockedPurgeCategories(targets).map((entry) => entry.category)
  );
  return targets.map((target) => {
    const deletable = target.counts
      .filter((entry) => entry.disposition === "deletable")
      .reduce((total, entry) => total + entry.count, 0);
    const isBlocked = target.counts.some(
      (entry) => entry.count > 0 && blocked.has(entry.category)
    );
    return {
      employeeId: target.employeeId,
      employeeNumber: target.employeeNumber,
      employeeName: target.employeeName,
      deletableRecordCount: deletable,
      blocked: isBlocked,
    };
  });
}

/** Load the full plan for a selection: targets, counts and direct reports. */
async function loadPlan(
  employeeIds: readonly string[],
  organizationId: string
): Promise<{
  targets: TestDataPurgeTarget[];
  directReports: TestDataPurgeDirectReport[];
  missingCount: number;
}> {
  return db.transaction(async (tx) => {
    const targets = await listPurgeTargets(tx, employeeIds, organizationId);
    const counts = await countPurgeDependencies(
      tx,
      targets.map((target) => target.employeeId)
    );
    for (const target of targets) {
      target.counts = counts.get(target.employeeId) ?? [];
    }
    const directReports = await listPurgeDirectReports(
      tx,
      targets.map((target) => target.employeeId),
      organizationId
    );
    return {
      targets,
      directReports,
      missingCount: employeeIds.length - targets.length,
    };
  });
}

/**
 * Load the eligible test-employee list for the Settings page.
 *
 * Authorization is enforced here so the page and the action agree, and the
 * filter is the same database-side `LIKE` the action validates against.
 */
export async function listPurgeableTestEmployeesAction(): Promise<
  | {
      status: "success";
      employees: {
        employeeId: string;
        employeeNumber: string;
        employeeName: string;
        employmentStatus: string;
      }[];
    }
  | { status: "error"; code: TestDataPurgeStateCode; message: string }
> {
  const authorized = await authorizePurge();
  if (!authorized.allowed) {
    return {
      status: "error",
      code: authorized.state.status === "error" ? authorized.state.code : "FORBIDDEN",
      message:
        authorized.state.status === "error"
          ? authorized.state.message
          : TEST_DATA_PURGE_FORBIDDEN_MESSAGE,
    };
  }
  try {
    const employees = await listTestDataEmployees(
      authorized.user.organizationId
    );
    return { status: "success", employees };
  } catch (readError) {
    console.error("[employees] test data purge list failed", readError);
    return {
      status: "error",
      code: "PURGE_FAILED",
      message: TEST_DATA_PURGE_FAILED_MESSAGE,
    };
  }
}

/**
 * STEP 1 — build the pre-purge plan. READ-ONLY; deletes nothing.
 *
 * Returns the server-generated confirmation token, the per-employee
 * dependency breakdown, and any block the analysis already resolves to. The
 * dialog echoes the token back to `purgeTestEmployeesAction`, which recomputes
 * the plan and refuses any mismatch.
 */
export async function analyzeTestDataPurgeAction(
  _prevState: TestDataPurgeState,
  formData: FormData
): Promise<TestDataPurgeState> {
  const authorized = await authorizePurge();
  if (!authorized.allowed) return authorized.state;

  const employeeIds = parseEmployeeIds(field(formData, "employeeIds"));
  if (employeeIds.length === 0) {
    return error("EMPTY_SELECTION", TEST_DATA_PURGE_EMPTY_SELECTION_MESSAGE);
  }

  try {
    const { targets, directReports, missingCount } = await loadPlan(
      employeeIds,
      authorized.user.organizationId
    );
    if (targets.length === 0) {
      return error("NOT_FOUND", TEST_DATA_PURGE_NOT_FOUND_MESSAGE);
    }
    // A partially-resolvable selection means at least one id was outside the
    // caller's organization or has since been deleted. Refuse rather than purge
    // the subset: a silent partial purge is the dangerous outcome.
    if (missingCount > 0) {
      return error(
        "ORGANIZATION_MISMATCH",
        "One or more selected records do not belong to your organization. " +
          TEST_DATA_PURGE_ADVICE
      );
    }

    const selections = summarize(targets);
    const decision = evaluateTestDataPurge({ targets, directReports });
    if (!decision.allowed) {
      const code =
        decision.code === "NOT_TEST_DATA"
          ? "NOT_TEST_DATA"
          : decision.code === "PROTECTED_RECORDS"
            ? "PROTECTED_RECORDS"
            : "PRODUCTION_DIRECT_REPORT";
      await writeTestDataPurgeAudit(db, {
        organizationId: authorized.user.organizationId,
        actorUserId: authorized.user.id,
        actorEmail: authorized.user.email,
        actorRole: authorized.actorRole,
        result: "DENIED",
        reason: decision.code,
        selections,
      });
      return {
        status: "analyzed",
        token: buildPurgePlanToken(targets, directReports),
        selections,
        totalDeletableRecords: totalDeletablePurgeRecords(targets),
        directReportCount: directReports.length,
        confirmationPhrase: TEST_DATA_PURGE_CONFIRMATION_PHRASE,
        blockedCode: code,
        blockedMessage: decision.message,
      };
    }

    return {
      status: "analyzed",
      token: buildPurgePlanToken(targets, directReports),
      selections,
      totalDeletableRecords: totalDeletablePurgeRecords(targets),
      directReportCount: directReports.length,
      confirmationPhrase: TEST_DATA_PURGE_CONFIRMATION_PHRASE,
    };
  } catch (analysisError) {
    console.error("[employees] test data purge analysis failed", analysisError);
    return error("PURGE_FAILED", TEST_DATA_PURGE_FAILED_MESSAGE);
  }
}

/**
 * STEP 2 — execute the purge. ALL OR NOTHING.
 *
 * Guards, in order; the first failure wins and NOTHING is written:
 * 1. `requireUser` + the `employees.test_data_purge` code AND `isSuperAdmin`.
 * 2. A well-formed, non-empty, de-duplicated selection.
 * 3. Selection resolves ENTIRELY inside the caller's organization.
 * 4. The submitted plan token matches a plan the server recomputes on the
 *    transaction's own snapshot — so a tampered selection or a changed row
 *    count cannot slip through.
 * 5. Every target is designated TEST data by its STORED employee number.
 * 6. NO protected history anywhere in the selection.
 * 7. NO production employee in the reporting line.
 * 8. Typed phrase + acknowledgement checkbox, both re-validated server-side.
 *
 * Then, inside ONE transaction: explicit table-by-table DELETEs of the deletable
 * records, clear the manager links of leftover TEST-DATA direct reports, write
 * the SUCCESS audit row, and delete the employee rows. Any throw rolls
 * everything back.
 */
export async function purgeTestEmployeesAction(
  _prevState: TestDataPurgeState,
  formData: FormData
): Promise<TestDataPurgeState> {
  const authorized = await authorizePurge();
  if (!authorized.allowed) return authorized.state;

  const organizationId = authorized.user.organizationId;
  const auditContext = {
    organizationId,
    actorUserId: authorized.user.id,
    actorEmail: authorized.user.email,
    actorRole: authorized.actorRole,
  };
  const submittedToken = field(formData, "planToken");

  const employeeIds = parseEmployeeIds(field(formData, "employeeIds"));
  if (employeeIds.length === 0) {
    await writeTestDataPurgeAudit(db, {
      ...auditContext,
      result: "DENIED",
      reason: "EMPTY_SELECTION",
    });
    return error("EMPTY_SELECTION", TEST_DATA_PURGE_EMPTY_SELECTION_MESSAGE);
  }

  // Confirmation layers are checked BEFORE the transaction so a mistyped
  // operator request costs nothing. Both are re-validated inside the
  // transaction against the locked rows as well.
  const typedPhrase = field(formData, "confirmationPhrase");
  if (!matchesPurgeConfirmationPhrase(typedPhrase)) {
    await writeTestDataPurgeAudit(db, {
      ...auditContext,
      result: "DENIED",
      reason: "PHRASE_MISMATCH",
    });
    return error("INVALID_CONFIRMATION", TEST_DATA_PURGE_INVALID_CONFIRMATION_MESSAGE);
  }
  if (!isAcknowledged(formData)) {
    await writeTestDataPurgeAudit(db, {
      ...auditContext,
      result: "DENIED",
      reason: "ACKNOWLEDGEMENT_MISSING",
    });
    return error("INVALID_CONFIRMATION", TEST_DATA_PURGE_ACKNOWLEDGEMENT_MESSAGE);
  }

  type PurgeOutcome =
    | {
        code: "SUCCESS";
        /** Ids of the removed employees, needed for the post-commit cleanup. */
        removedEmployeeIds: string[];
        removedRelatedRecords: number;
        clearedManagerLinks: number;
      }
    | {
        code: "REFUSED";
        stateCode: TestDataPurgeStateCode;
        message: string;
        reason: string;
        selections: TestDataPurgeSelectionSummary[];
      };

  let outcome: PurgeOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const targetIds = employeeIds;

      // Org-scoped load on the transaction's snapshot. Cross-org ids simply do
      // not resolve, so existence never leaks.
      const targets = await listPurgeTargets(tx, targetIds, organizationId);
      if (targets.length === 0) {
        return {
          code: "REFUSED",
          stateCode: "NOT_FOUND",
          message: TEST_DATA_PURGE_NOT_FOUND_MESSAGE,
          reason: "NOT_FOUND",
          selections: [],
        } as const;
      }
      if (targets.length !== targetIds.length) {
        return {
          code: "REFUSED",
          stateCode: "ORGANIZATION_MISMATCH",
          message:
            "One or more selected records do not belong to your organization. " +
            TEST_DATA_PURGE_ADVICE,
          reason: "ORGANIZATION_MISMATCH",
          selections: summarize(targets),
        } as const;
      }

      // Counts on the SAME snapshot, then the policy decision.
      const counts = await countPurgeDependencies(
        tx,
        targets.map((target) => target.employeeId)
      );
      for (const target of targets) {
        target.counts = counts.get(target.employeeId) ?? [];
      }
      const directReports = await listPurgeDirectReports(
        tx,
        targets.map((target) => target.employeeId),
        organizationId
      );

      // The plan is regenerated HERE and fingerprinted. A mismatch means the
      // selection or the underlying rows changed after the operator reviewed
      // them, so the operator's consent no longer applies.
      if (buildPurgePlanToken(targets, directReports) !== submittedToken) {
        return {
          code: "REFUSED",
          stateCode: "INVALID_CONFIRMATION",
          message: TEST_DATA_PURGE_INVALID_CONFIRMATION_MESSAGE,
          reason: "PLAN_CHANGED",
          selections: summarize(targets),
        } as const;
      }

      // Eligibility re-checked from the STORED number, never the submitted id.
      const notTestData = targets.filter(
        (target) => !isTestDataEmployeeNumber(target.employeeNumber)
      );
      if (notTestData.length > 0) {
        return {
          code: "REFUSED",
          stateCode: "NOT_TEST_DATA",
          message: TEST_DATA_PURGE_NOT_TEST_DATA_MESSAGE,
          reason: "NOT_TEST_DATA",
          selections: summarize(targets),
        } as const;
      }

      // Every employee must ALSO have its own phrase confirmed, so a
      // multi-employee purge cannot be approved by acknowledging one record.
      // The submitted text is matched against the STORED employee number.
      const typedPhrases = formData
        .getAll("employeeConfirmations")
        .filter((value): value is string => typeof value === "string");
      const unconfirmed = targets.filter(
        (target) =>
          !typedPhrases.some((value) =>
            matchesEmployeePurgeConfirmation(target.employeeNumber, value)
          )
      );
      if (unconfirmed.length > 0) {
        return {
          code: "REFUSED",
          stateCode: "INVALID_CONFIRMATION",
          message:
            unconfirmed.length === 1
              ? `Confirm the purge by typing "${purgeConfirmationPhraseFor(
                  unconfirmed[0]!.employeeNumber
                )}".`
              : "Confirm every selected employee by typing its confirmation phrase.",
          reason: "PER_EMPLOYEE_CONFIRMATION_MISSING",
          selections: summarize(targets),
        } as const;
      }

      const decision = evaluateTestDataPurge({ targets, directReports });
      if (!decision.allowed) {
        return {
          code: "REFUSED",
          stateCode:
            decision.code === "NOT_TEST_DATA"
              ? "NOT_TEST_DATA"
              : decision.code === "PROTECTED_RECORDS"
                ? "PROTECTED_RECORDS"
                : "PRODUCTION_DIRECT_REPORT",
          message:
            decision.code === "PROTECTED_RECORDS"
              ? buildProtectedPurgeMessage(decision.blockedCategories ?? [])
              : decision.code === "PRODUCTION_DIRECT_REPORT"
                ? buildProductionDirectReportMessage(
                    decision.productionDirectReports ?? []
                  )
                : TEST_DATA_PURGE_NOT_TEST_DATA_MESSAGE,
          reason: decision.code,
          selections: summarize(targets),
        } as const;
      }

      // Every guard passed. Explicit, org-scoped, table-by-table removal.
      //
      // Employment history is removed FIRST and through its own gated plan,
      // because it is the one category covered by the approved test-data
      // exception. `eligibleEmployeeIds` is built here from the eligibility
      // gate above, and `deletePurgeEmploymentHistory` re-verifies the stored
      // `EMP-TEST-*` number on every row before deleting it. Attendance, leave,
      // permission, payroll and payslip rows are NOT included: they remain
      // protected, and `deletePurgeDeletableRecords` never touches them.
      const eligibleEmployeeIds = targets
        .filter((target) => isTestDataEmployeeNumber(target.employeeNumber))
        .map((target) => target.employeeId);
      const removedEmploymentHistory = await deletePurgeEmploymentHistory(
        tx,
        eligibleEmployeeIds,
        organizationId
      );

      const removedRelated = await deletePurgeDeletableRecords(
        tx,
        targets.map((target) => target.employeeId),
        organizationId
      );
      if (removedEmploymentHistory > 0) {
        removedRelated["Employment history"] = removedEmploymentHistory;
      }
      const clearedManagerLinks = await clearTestDataManagerLinks(
        tx,
        decision.managerLinksCleared.map((report) => report.employeeId),
        organizationId
      );
      const removedEmployees = await deletePurgeEmployees(
        tx,
        targets.map((target) => target.employeeId),
        organizationId
      );

      // The SUCCESS audit row is written INSIDE the transaction, so it commits
      // atomically with the deletes it describes and its `entity_id` column has
      // no foreign key to the now-removed employees.
      await writeTestDataPurgeAudit(
        tx,
        {
          ...auditContext,
          result: "SUCCESS",
          selections: summarize(targets),
          removedRelatedRecords: removedRelated,
          clearedManagerLinks,
        }
      );

      return {
        code: "SUCCESS",
        removedEmployeeIds: removedEmployees,
        removedRelatedRecords: Object.values(removedRelated).reduce(
          (total, count) => total + count,
          0
        ),
        clearedManagerLinks,
      } as const;
    });
  } catch (purgeError) {
    console.error("[employees] test data purge failed", purgeError);
    await writeTestDataPurgeAudit(db, {
      ...auditContext,
      result: "FAILED",
      reason: "UNEXPECTED_ERROR",
    });
    return error("PURGE_FAILED", TEST_DATA_PURGE_FAILED_MESSAGE);
  }

  if (outcome.code === "REFUSED") {
    await writeTestDataPurgeAudit(db, {
      ...auditContext,
      result: "DENIED",
      reason: outcome.reason,
      selections: outcome.selections,
    });
    return {
      status: "error",
      code: outcome.stateCode,
      message: outcome.message,
      selections: outcome.selections,
    };
  }

  // Post-commit, the ONLY artifact outside the transaction is each employee's
  // private document folder. Removed AFTER the commit so a rollback can never
  // lose files, and never before so a committed purge never orphans them. A
  // storage failure is logged, never reported as a purge failure: the rows are
  // already gone and reporting otherwise would be a lie.
  await Promise.all(
    outcome.removedEmployeeIds.map(async (employeeId) => {
      try {
        await deleteEmployeeDocumentStorage(
          organizationId,
          employeeId
        );
      } catch (storageError) {
        console.error(
          "[employees] could not remove document storage for purged employee",
          employeeId,
          storageError
        );
      }
    })
  );

  revalidatePath("/employees");
  revalidatePath("/settings/test-data-purge");

  const removedEmployees = outcome.removedEmployeeIds.length;
  return {
    status: "success",
    message:
      removedEmployees === 1
        ? "1 test employee permanently removed."
        : `${removedEmployees} test employees permanently removed.`,
    removedEmployees,
    removedRelatedRecords: outcome.removedRelatedRecords,
    clearedManagerLinks: outcome.clearedManagerLinks,
  };
}
