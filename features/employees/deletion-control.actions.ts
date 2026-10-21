"use server";

import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  employeeDeletionApprovals,
  employeeDeletionRequests,
  employeeLegalHolds,
  employees,
} from "@/db/schema";
import type { AuditAction } from "@/lib/auth/audit";
import { writeAuditLog } from "@/lib/auth/audit";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";

import {
  DELETION_EXECUTION_DISABLED_MESSAGE,
  DELETION_REASON_REQUIRED_MESSAGE,
  DELETION_SELF_APPROVAL_MESSAGE,
  evaluateDeletionApproval,
  evaluateDeletionEligibility,
  isDeletionExecutionEnabled,
  isRetainedEligibility,
  isValidDeletionReason,
  type DeletionApprovalRecord,
  type DeletionTier,
} from "./deletion-control-policy.ts";
import {
  matchesEmployeeNumberConfirmation,
  resolveEmployeePermanentDeleteScope,
} from "./permanent-delete-policy.ts";
import {
  getEmployeeById,
  listEmployeeDeletionDependencies,
} from "./queries";

/**
 * Employee permanent-deletion CONTROL actions (additive, NON-DESTRUCTIVE).
 *
 * This module implements legal holds and the dual-control approval workflow
 * described in `docs/employee-permanent-delete-policy.md`. It is deliberately
 * separate from `permanentlyDeleteEmployeeAction` and contains **no DELETE
 * statement at all**:
 * - legal holds are INSERT/UPDATE only;
 * - deletion requests and approvals are INSERT/UPDATE only;
 * - the executor (`executeApprovedEmployeeDeletionAction`) asserts
 *   `isDeletionExecutionEnabled()` (currently `false`) and REFUSES. Enabling it
 *   is a separate, reviewed change that requires the retention-policy sign-off.
 *
 * Security (identical rules to the existing permanent-delete action):
 * - Every action re-authenticates (`requireUser`) and re-authorizes against the
 *   database-backed RBAC of the session. Role codes and organization ids are
 *   never read from the form.
 * - The employee's OWNING organization is read from the database; the
 *   `requestedOrganizationId` argument is only a consistency assertion.
 * - Deletions and holds require the system-level SUPERADMIN role AND the
 *   corresponding system-only permission code.
 *
 * AUDIT PARITY with the live action: every attempt — SUCCESS, DENIED (with a
 * machine-readable reason) and FAILED — appends one audit row, so a refused or
 * failed control operation is as visible as a successful one.
 *
 * NOTE: the tables these actions write are created by migration
 * `0021_employee_deletion_controls.sql`, which is NOT applied. Until it is,
 * these actions fail at the database and return a refusal (FAILED); nothing
 * destructive is ever performed.
 */

export interface LegalHoldState {
  status: "idle" | "error" | "success";
  message?: string;
  code?:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "REASON_REQUIRED"
    | "HOLD_EXISTS"
    | "FAILED";
  holdId?: string;
}

export interface DeletionRequestState {
  status: "idle" | "error" | "success";
  message?: string;
  code?:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "REASON_REQUIRED"
    | "CONFIRMATION_MISMATCH"
    | "LEGAL_HOLD"
    | "RETENTION_BOUND"
    | "FAILED";
  requestId?: string;
  tier?: DeletionTier;
  requiredApprovals?: number;
}

export interface DeletionDecisionState {
  status: "idle" | "error" | "success";
  message?: string;
  code?:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "NOT_PENDING"
    | "SELF_APPROVAL_FORBIDDEN"
    | "FAILED";
  decision?: "approved" | "rejected" | "pending";
}

export interface DeletionExecutionState {
  status: "idle" | "error" | "success";
  message?: string;
  code?:
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "NOT_APPROVED"
    | "EXECUTION_DISABLED"
    | "FAILED";
}

const DB_UNIQUE_VIOLATION = "23505";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === DB_UNIQUE_VIOLATION
  );
}

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optionalField(formData: FormData, name: string): string | undefined {
  const value = field(formData, name);
  return value === "" ? undefined : value;
}

/**
 * The authenticated actor, resolved BEFORE any allow/deny decision so that a
 * refusal can still be audited with the real identity (the live action does
 * the same). `roleLabel` is audit metadata only and is nullable, mirroring
 * `displayRoleLabel` (`string | null`) and `auditPermanentEmployeeDelete`
 * (`actorRole: string | null`) in `actions.ts`. Authorization is decided by
 * `authorized`, never by the label.
 */
interface DeletionControlContext {
  userId: string;
  email: string | null;
  roleLabel: string | null;
  sessionOrganizationId: string | null;
  /** SUPERADMIN role AND the explicit system-only permission code. */
  authorized: boolean;
}

async function resolveControlContext(
  permissionCode: Permission
): Promise<DeletionControlContext> {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);
  const authorized =
    authorization.isSuperAdmin &&
    authorization.permissionCodes.includes(permissionCode);
  return {
    userId: user.id,
    email: user.email ?? null,
    roleLabel: displayRoleLabel(authorization.roleCodes),
    sessionOrganizationId: user.organizationId ?? null,
    authorized,
  };
}

async function auditControlEvent(input: {
  context: DeletionControlContext;
  organizationId: string | null;
  action: AuditAction;
  entityId: string | null;
  metadata: Record<string, unknown>;
}): Promise<void> {
  try {
    await writeAuditLog({
      organizationId: input.organizationId,
      actorUserId: input.context.userId,
      action: input.action,
      entityType: "employee",
      entityId: input.entityId,
      metadata: {
        actorUserId: input.context.userId,
        actorEmail: input.context.email,
        actorRole: input.context.roleLabel,
        ...input.metadata,
      },
    });
  } catch (error) {
    console.error("[employees] deletion-control audit failed", error);
  }
}

/* ------------------------------------------------------------------ */
/* Legal holds                                                        */
/* ------------------------------------------------------------------ */

const LEGAL_HOLD_FORBIDDEN_MESSAGE =
  "You do not have permission to manage legal holds.";

/** Place an active legal hold. Requires reason. Never deletes anything. */
export async function placeEmployeeLegalHoldAction(
  employeeId: string,
  requestedOrganizationId: string | null,
  _prevState: LegalHoldState,
  formData: FormData
): Promise<LegalHoldState> {
  const context = await resolveControlContext(PERMISSIONS.EMPLOYEES_LEGAL_HOLD);
  if (!context.authorized || !context.sessionOrganizationId) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.legal_hold.placed",
      entityId: employeeId,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
        result: "DENIED",
        reason: "PERMISSION_DENIED",
      },
    });
    return {
      status: "error",
      code: "FORBIDDEN",
      message: LEGAL_HOLD_FORBIDDEN_MESSAGE,
    };
  }

  const employee = await getEmployeeById(employeeId);
  const scope = employee
    ? resolveEmployeePermanentDeleteScope({
        employeeOrganizationId: employee.organizationId,
        userOrganizationId: context.sessionOrganizationId,
        isSuperAdmin: true,
        requestedOrganizationId,
      })
    : null;
  if (!employee || !scope) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.legal_hold.placed",
      entityId: employeeId,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
        result: "DENIED",
        reason: "NOT_FOUND",
      },
    });
    return { status: "error", code: "NOT_FOUND", message: "Employee not found." };
  }

  const reason = field(formData, "reason");
  if (!isValidDeletionReason(reason)) {
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.legal_hold.placed",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
        result: "DENIED",
        reason: "REASON_REQUIRED",
        employeeNumber: employee.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "REASON_REQUIRED",
      message: DELETION_REASON_REQUIRED_MESSAGE,
    };
  }

  // Fail fast on the common case; the partial unique index
  // `employee_legal_holds_active_hold_unique` closes the concurrent race.
  const existingHold = await db
    .select({ id: employeeLegalHolds.id })
    .from(employeeLegalHolds)
    .where(
      and(
        eq(employeeLegalHolds.employeeId, employee.id),
        eq(employeeLegalHolds.organizationId, scope.organizationId),
        eq(employeeLegalHolds.active, true)
      )
    )
    .limit(1);
  if (existingHold.length > 0) {
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.legal_hold.placed",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
        result: "DENIED",
        reason: "HOLD_EXISTS",
        employeeNumber: employee.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "HOLD_EXISTS",
      message: "An active legal hold already exists for this employee.",
    };
  }

  try {
    const inserted = await db
      .insert(employeeLegalHolds)
      .values({
        organizationId: scope.organizationId,
        employeeId: employee.id,
        employeeNumberSnapshot: employee.employeeNumber,
        employeeNameSnapshot: `${employee.firstName} ${employee.lastName}`,
        reason: reason.trim(),
        authority: optionalField(formData, "authority") ?? null,
        reference: optionalField(formData, "reference") ?? null,
        placedByUserId: context.userId,
        placedByEmail: context.email,
        active: true,
      })
      .returning({ id: employeeLegalHolds.id });

    const holdId = inserted[0]?.id ?? null;
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.legal_hold.placed",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
        result: "SUCCESS",
        employeeNumber: employee.employeeNumber,
        holdId,
        reason: reason.trim(),
      },
    });
    return {
      status: "success",
      message: "Legal hold placed.",
      holdId: holdId ?? undefined,
    };
  } catch (error) {
    // The partial unique index makes a concurrent second place fail here.
    if (isUniqueViolation(error)) {
      await auditControlEvent({
        context,
        organizationId: scope.organizationId,
        action: "employee.legal_hold.placed",
        entityId: employee.id,
        metadata: {
          operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
          result: "DENIED",
          reason: "HOLD_EXISTS",
          employeeNumber: employee.employeeNumber,
        },
      });
      return {
        status: "error",
        code: "HOLD_EXISTS",
        message: "An active legal hold already exists for this employee.",
      };
    }
    console.error("[employees] place legal hold failed", error);
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.legal_hold.placed",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_PLACED",
        result: "FAILED",
        reason: "UNEXPECTED_ERROR",
        employeeNumber: employee.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "FAILED",
      message: "Could not place the legal hold.",
    };
  }
}

type ReleaseOutcome =
  | { code: "NOT_FOUND" }
  | {
      code: "RELEASED";
      holdId: string;
      organizationId: string;
      employeeId: string | null;
    };

/** Release an active legal hold. Requires reason. Never deletes anything. */
export async function releaseEmployeeLegalHoldAction(
  holdId: string,
  requestedOrganizationId: string | null,
  _prevState: LegalHoldState,
  formData: FormData
): Promise<LegalHoldState> {
  const context = await resolveControlContext(PERMISSIONS.EMPLOYEES_LEGAL_HOLD);
  if (!context.authorized || !context.sessionOrganizationId) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.legal_hold.released",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_RELEASED",
        result: "DENIED",
        reason: "PERMISSION_DENIED",
        holdId,
      },
    });
    return {
      status: "error",
      code: "FORBIDDEN",
      message: LEGAL_HOLD_FORBIDDEN_MESSAGE,
    };
  }

  const reason = field(formData, "reason");
  if (!isValidDeletionReason(reason)) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.legal_hold.released",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_RELEASED",
        result: "DENIED",
        reason: "REASON_REQUIRED",
        holdId,
      },
    });
    return {
      status: "error",
      code: "REASON_REQUIRED",
      message: DELETION_REASON_REQUIRED_MESSAGE,
    };
  }

  let outcome: ReleaseOutcome;
  try {
    // SELECT + UPDATE share one transaction and the row is locked, so two
    // concurrent releases cannot both report success.
    outcome = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: employeeLegalHolds.id,
          organizationId: employeeLegalHolds.organizationId,
          employeeId: employeeLegalHolds.employeeId,
        })
        .from(employeeLegalHolds)
        .where(
          and(
            eq(employeeLegalHolds.id, holdId),
            eq(employeeLegalHolds.active, true)
          )
        )
        .for("update")
        .limit(1);
      const hold = rows[0];
      // The requested context is only a consistency assertion; the hold's own
      // organization is authoritative.
      const requested = requestedOrganizationId?.trim();
      if (!hold || (requested && requested !== hold.organizationId)) {
        return { code: "NOT_FOUND" } as const;
      }

      const updated = await tx
        .update(employeeLegalHolds)
        .set({
          active: false,
          releasedAt: new Date(),
          releasedByUserId: context.userId,
          releasedByEmail: context.email,
          releaseReason: reason.trim(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(employeeLegalHolds.id, hold.id),
            eq(employeeLegalHolds.active, true)
          )
        )
        .returning({ id: employeeLegalHolds.id });
      if (updated.length === 0) {
        return { code: "NOT_FOUND" } as const;
      }
      return {
        code: "RELEASED",
        holdId: hold.id,
        organizationId: hold.organizationId,
        employeeId: hold.employeeId,
      } as const;
    });
  } catch (error) {
    console.error("[employees] release legal hold failed", error);
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.legal_hold.released",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_RELEASED",
        result: "FAILED",
        reason: "UNEXPECTED_ERROR",
        holdId,
      },
    });
    return {
      status: "error",
      code: "FAILED",
      message: "Could not release the legal hold.",
    };
  }

  if (outcome.code === "RELEASED") {
    await auditControlEvent({
      context,
      organizationId: outcome.organizationId,
      action: "employee.legal_hold.released",
      entityId: outcome.employeeId,
      metadata: {
        operation: "EMPLOYEE_LEGAL_HOLD_RELEASED",
        result: "SUCCESS",
        holdId: outcome.holdId,
        reason: reason.trim(),
      },
    });
    return {
      status: "success",
      message: "Legal hold released.",
      holdId: outcome.holdId,
    };
  }

  await auditControlEvent({
    context,
    organizationId: context.sessionOrganizationId,
    action: "employee.legal_hold.released",
    entityId: null,
    metadata: {
      operation: "EMPLOYEE_LEGAL_HOLD_RELEASED",
      result: "DENIED",
      reason: "NOT_FOUND",
      holdId,
    },
  });
  return {
    status: "error",
    code: "NOT_FOUND",
    message: "Legal hold not found or already released.",
  };
}

/* ------------------------------------------------------------------ */
/* Deletion requests                                                  */
/* ------------------------------------------------------------------ */

type RequestOutcome =
  | { code: "NOT_FOUND" }
  | { code: "CONFIRMATION_MISMATCH" }
  | {
      code: "RETAINED";
      refusalCode: "LEGAL_HOLD" | "RETENTION_BOUND";
      message: string;
    }
  | {
      code: "CREATED";
      requestId: string;
      tier: DeletionTier;
      requiredApprovals: number;
    };

/**
 * Raise a permanent-deletion request. NEVER deletes: it records the operator's
 * reason and the resolved tier so a second Super Administrator can decide it.
 */
export async function requestEmployeeDeletionAction(
  employeeId: string,
  requestedOrganizationId: string | null,
  _prevState: DeletionRequestState,
  formData: FormData
): Promise<DeletionRequestState> {
  const context = await resolveControlContext(
    PERMISSIONS.EMPLOYEES_PERMANENT_DELETE
  );
  if (!context.authorized || !context.sessionOrganizationId) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.requested",
      entityId: employeeId,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "DENIED",
        reason: "PERMISSION_DENIED",
      },
    });
    return {
      status: "error",
      code: "FORBIDDEN",
      message:
        "You do not have permission to request permanent deletion.",
    };
  }

  const reason = field(formData, "reason");
  if (!isValidDeletionReason(reason)) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.requested",
      entityId: employeeId,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "DENIED",
        reason: "REASON_REQUIRED",
      },
    });
    return {
      status: "error",
      code: "REASON_REQUIRED",
      message: DELETION_REASON_REQUIRED_MESSAGE,
    };
  }

  const employee = await getEmployeeById(employeeId);
  const scope = employee
    ? resolveEmployeePermanentDeleteScope({
        employeeOrganizationId: employee.organizationId,
        userOrganizationId: context.sessionOrganizationId,
        isSuperAdmin: true,
        requestedOrganizationId,
      })
    : null;
  if (!employee || !scope) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.requested",
      entityId: employeeId,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "DENIED",
        reason: "NOT_FOUND",
      },
    });
    return { status: "error", code: "NOT_FOUND", message: "Employee not found." };
  }

  const confirmation = field(formData, "confirmEmployeeNumber");
  if (
    !matchesEmployeeNumberConfirmation(employee.employeeNumber, confirmation)
  ) {
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.deletion.requested",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "DENIED",
        reason: "CONFIRMATION_MISMATCH",
        employeeNumber: employee.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "CONFIRMATION_MISMATCH",
      message: "Employee number confirmation does not match.",
    };
  }

  let outcome: RequestOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const locked = await tx
        .select({
          id: employees.id,
          employeeNumber: employees.employeeNumber,
          firstName: employees.firstName,
          lastName: employees.lastName,
        })
        .from(employees)
        .where(
          and(
            eq(employees.id, employee.id),
            eq(employees.organizationId, scope.organizationId)
          )
        )
        .for("update")
        .limit(1);
      const current = locked[0];
      if (!current) return { code: "NOT_FOUND" } as const;
      if (
        !matchesEmployeeNumberConfirmation(current.employeeNumber, confirmation)
      ) {
        return { code: "CONFIRMATION_MISMATCH" } as const;
      }

      const dependencies = await listEmployeeDeletionDependencies(
        tx,
        current.id,
        scope.organizationId
      );

      const holdRows = await tx
        .select({ id: employeeLegalHolds.id })
        .from(employeeLegalHolds)
        .where(
          and(
            eq(employeeLegalHolds.employeeId, current.id),
            eq(employeeLegalHolds.organizationId, scope.organizationId),
            eq(employeeLegalHolds.active, true)
          )
        )
        .limit(1);
      const legalHoldActive = holdRows.length > 0;

      const eligibility = evaluateDeletionEligibility({
        legalHoldActive,
        dependencies,
        employeeNumber: current.employeeNumber,
      });
      if (isRetainedEligibility(eligibility)) {
        return {
          code: "RETAINED",
          refusalCode: eligibility.code,
          message: eligibility.message,
        } as const;
      }

      const requiredApprovals =
        eligibility.tier === "special_approval"
          ? eligibility.requiredApprovals
          : 1;
      const inserted = await tx
        .insert(employeeDeletionRequests)
        .values({
          organizationId: scope.organizationId,
          employeeId: current.id,
          employeeNumber: current.employeeNumber,
          employeeName: `${current.firstName} ${current.lastName}`,
          requesterUserId: context.userId,
          requesterEmail: context.email,
          reason: reason.trim(),
          tier: eligibility.tier,
          status: "pending",
          requiredApprovals,
        })
        .returning({ id: employeeDeletionRequests.id });
      const requestId = inserted[0]?.id;
      if (!requestId) return { code: "NOT_FOUND" } as const;
      return {
        code: "CREATED",
        requestId,
        tier: eligibility.tier,
        requiredApprovals,
      } as const;
    });
  } catch (error) {
    console.error("[employees] deletion request failed", error);
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.deletion.requested",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "FAILED",
        reason: "UNEXPECTED_ERROR",
        employeeNumber: employee.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "FAILED",
      message: "Could not record the deletion request.",
    };
  }

  if (outcome.code === "CREATED") {
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.deletion.requested",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "SUCCESS",
        requestId: outcome.requestId,
        tier: outcome.tier,
        requiredApprovals: outcome.requiredApprovals,
        employeeNumber: employee.employeeNumber,
        reason: reason.trim(),
      },
    });
    return {
      status: "success",
      message: `Deletion request recorded (tier: ${outcome.tier}). ${outcome.requiredApprovals} distinct approval(s) required.`,
      requestId: outcome.requestId,
      tier: outcome.tier,
      requiredApprovals: outcome.requiredApprovals,
    };
  }

  if (outcome.code === "RETAINED") {
    await auditControlEvent({
      context,
      organizationId: scope.organizationId,
      action: "employee.deletion.requested",
      entityId: employee.id,
      metadata: {
        operation: "EMPLOYEE_DELETION_REQUESTED",
        result: "DENIED",
        reason: outcome.refusalCode,
        employeeNumber: employee.employeeNumber,
      },
    });
    return {
      status: "error",
      code: outcome.refusalCode,
      message: outcome.message,
    };
  }

  await auditControlEvent({
    context,
    organizationId: scope.organizationId,
    action: "employee.deletion.requested",
    entityId: employee.id,
    metadata: {
      operation: "EMPLOYEE_DELETION_REQUESTED",
      result: "DENIED",
      reason: outcome.code,
      employeeNumber: employee.employeeNumber,
    },
  });
  return {
    status: "error",
    code: outcome.code,
    message:
      outcome.code === "NOT_FOUND"
        ? "Employee not found."
        : "Employee number confirmation does not match.",
  };
}

/* ------------------------------------------------------------------ */
/* Dual-control decisions                                             */
/* ------------------------------------------------------------------ */

type DecisionOutcome =
  | { code: "NOT_FOUND" }
  | { code: "NOT_PENDING" }
  | { code: "SELF_APPROVAL" }
  | { code: "INVALID"; message: string }
  | {
      code: "DECIDED";
      decision: "approved" | "rejected" | "pending";
      organizationId: string;
      employeeId: string | null;
      employeeNumber: string;
      comment?: string;
    };

const DECISION_FORBIDDEN_MESSAGE =
  "You do not have permission to decide deletion requests.";

/** Approve or reject a pending deletion request. Self-approval is refused. */
export async function decideEmployeeDeletionRequestAction(
  requestId: string,
  requestedOrganizationId: string | null,
  _prevState: DeletionDecisionState,
  formData: FormData
): Promise<DeletionDecisionState> {
  const context = await resolveControlContext(
    PERMISSIONS.EMPLOYEES_DELETION_APPROVE
  );
  if (!context.authorized || !context.sessionOrganizationId) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.rejected",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_DECISION",
        result: "DENIED",
        reason: "PERMISSION_DENIED",
        requestId,
      },
    });
    return {
      status: "error",
      code: "FORBIDDEN",
      message: DECISION_FORBIDDEN_MESSAGE,
    };
  }

  const rawDecision = field(formData, "decision");
  if (rawDecision !== "approve" && rawDecision !== "reject") {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.rejected",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_DECISION",
        result: "DENIED",
        reason: "INVALID_DECISION",
        requestId,
      },
    });
    return {
      status: "error",
      code: "NOT_PENDING",
      message: "A valid decision (approve or reject) is required.",
    };
  }
  const decisionValue = rawDecision === "approve" ? "approved" : "rejected";
  const comment = optionalField(formData, "comment");

  let outcome: DecisionOutcome;
  try {
    outcome = await db.transaction(async (tx) => {
      const rows = await tx
        .select({
          id: employeeDeletionRequests.id,
          organizationId: employeeDeletionRequests.organizationId,
          employeeId: employeeDeletionRequests.employeeId,
          employeeNumber: employeeDeletionRequests.employeeNumber,
          requesterUserId: employeeDeletionRequests.requesterUserId,
          status: employeeDeletionRequests.status,
          requiredApprovals: employeeDeletionRequests.requiredApprovals,
        })
        .from(employeeDeletionRequests)
        .where(eq(employeeDeletionRequests.id, requestId))
        .for("update")
        .limit(1);
      const request = rows[0];
      const requested = requestedOrganizationId?.trim();
      if (!request || (requested && requested !== request.organizationId)) {
        return { code: "NOT_FOUND" } as const;
      }
      if (request.status !== "pending") {
        return { code: "NOT_PENDING" } as const;
      }
      if (request.requesterUserId === context.userId) {
        return { code: "SELF_APPROVAL" } as const;
      }

      const existing = await tx
        .select({
          approverUserId: employeeDeletionApprovals.approverUserId,
          decision: employeeDeletionApprovals.decision,
        })
        .from(employeeDeletionApprovals)
        .where(eq(employeeDeletionApprovals.requestId, request.id));

      const combined: DeletionApprovalRecord[] = [
        ...existing
          .filter(
            (row): row is { approverUserId: string; decision: string } =>
              row.approverUserId !== null
          )
          .map((row) => ({
            approverUserId: row.approverUserId,
            decision: row.decision as DeletionApprovalRecord["decision"],
          })),
        { approverUserId: context.userId, decision: decisionValue },
      ];

      const approval = evaluateDeletionApproval({
        requesterUserId: request.requesterUserId ?? "",
        requiredApprovals: request.requiredApprovals,
        approvals: combined,
      });
      if (approval.status === "invalid") {
        return { code: "INVALID", message: approval.message } as const;
      }

      await tx.insert(employeeDeletionApprovals).values({
        requestId: request.id,
        organizationId: request.organizationId,
        approverUserId: context.userId,
        approverEmail: context.email,
        decision: decisionValue,
        comment: comment ?? null,
      });

      let resolved: "approved" | "rejected" | "pending" = "pending";
      if (approval.status === "rejected") {
        resolved = "rejected";
      } else if (approval.status === "approved") {
        resolved = "approved";
      }
      if (resolved !== "pending") {
        await tx
          .update(employeeDeletionRequests)
          .set({
            status: resolved,
            decidedAt: new Date(),
            decisionReason: comment ?? null,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(employeeDeletionRequests.id, request.id),
              eq(employeeDeletionRequests.status, "pending")
            )
          );
      }

      return {
        code: "DECIDED",
        decision: resolved,
        organizationId: request.organizationId,
        employeeId: request.employeeId,
        employeeNumber: request.employeeNumber,
        comment,
      } as const;
    });
  } catch (error) {
    console.error("[employees] deletion decision failed", error);
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.rejected",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_DECISION",
        result: "FAILED",
        reason: "UNEXPECTED_ERROR",
        requestId,
      },
    });
    return {
      status: "error",
      code: "FAILED",
      message: "Could not record the decision.",
    };
  }

  if (outcome.code === "DECIDED") {
    const auditAction: AuditAction =
      outcome.decision === "rejected"
        ? "employee.deletion.rejected"
        : outcome.decision === "approved"
          ? "employee.deletion.approved"
          : "employee.deletion.requested";
    await auditControlEvent({
      context,
      organizationId: outcome.organizationId,
      action: auditAction,
      entityId: outcome.employeeId,
      metadata: {
        operation: "EMPLOYEE_DELETION_DECISION",
        result: outcome.decision.toUpperCase(),
        requestId,
        decision: outcome.decision,
        employeeNumber: outcome.employeeNumber,
        comment: outcome.comment ?? null,
      },
    });
    return {
      status: "success",
      decision: outcome.decision,
      message:
        outcome.decision === "approved"
          ? "Deletion request approved. Execution remains disabled pending retention-policy sign-off."
          : outcome.decision === "rejected"
            ? "Deletion request rejected."
            : "Decision recorded; awaiting further approvals.",
    };
  }

  if (outcome.code === "SELF_APPROVAL") {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.rejected",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_DECISION",
        result: "DENIED",
        reason: "SELF_APPROVAL_FORBIDDEN",
        requestId,
      },
    });
    return {
      status: "error",
      code: "SELF_APPROVAL_FORBIDDEN",
      message: DELETION_SELF_APPROVAL_MESSAGE,
    };
  }

  if (outcome.code === "INVALID") {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.rejected",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_DECISION",
        result: "DENIED",
        reason: "DUPLICATE_APPROVER",
        requestId,
      },
    });
    return { status: "error", code: "FAILED", message: outcome.message };
  }

  await auditControlEvent({
    context,
    organizationId: context.sessionOrganizationId,
    action: "employee.deletion.rejected",
    entityId: null,
    metadata: {
      operation: "EMPLOYEE_DELETION_DECISION",
      result: "DENIED",
      reason: outcome.code,
      requestId,
    },
  });
  return {
    status: "error",
    code: outcome.code === "NOT_FOUND" ? "NOT_FOUND" : "NOT_PENDING",
    message:
      outcome.code === "NOT_FOUND"
        ? "Deletion request not found."
        : "This deletion request is no longer pending.",
  };
}

/* ------------------------------------------------------------------ */
/* Executor — HARD DISABLED                                           */
/* ------------------------------------------------------------------ */

/**
 * Execute an APPROVED deletion request.
 *
 * DISABLED. This action deliberately performs no delete and contains no DELETE
 * statement. It records `employee.deletion.execution_blocked` and returns
 * `EXECUTION_DISABLED`. Enabling execution is a separate, reviewed change that
 * requires the retention-policy sign-off in
 * `docs/employee-permanent-delete-policy.md` §4.
 */
export async function executeApprovedEmployeeDeletionAction(
  requestId: string,
  requestedOrganizationId: string | null,
  _prevState: DeletionExecutionState,
  _formData: FormData
): Promise<DeletionExecutionState> {
  const context = await resolveControlContext(
    PERMISSIONS.EMPLOYEES_PERMANENT_DELETE
  );
  if (!context.authorized || !context.sessionOrganizationId) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.execution_blocked",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_EXECUTION_BLOCKED",
        result: "DENIED",
        reason: "PERMISSION_DENIED",
        requestId,
      },
    });
    return {
      status: "error",
      code: "FORBIDDEN",
      message:
        "You do not have permission to execute permanent deletion.",
    };
  }

  let request: {
    organizationId: string;
    employeeId: string | null;
    employeeNumber: string;
    status: string;
  } | null;
  try {
    const rows = await db
      .select({
        organizationId: employeeDeletionRequests.organizationId,
        employeeId: employeeDeletionRequests.employeeId,
        employeeNumber: employeeDeletionRequests.employeeNumber,
        status: employeeDeletionRequests.status,
      })
      .from(employeeDeletionRequests)
      .where(eq(employeeDeletionRequests.id, requestId))
      .limit(1);
    const requested = requestedOrganizationId?.trim();
    request = rows[0] ?? null;
    if (!request || (requested && requested !== request.organizationId)) {
      request = null;
    }
  } catch (error) {
    console.error("[employees] deletion execution check failed", error);
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.execution_blocked",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_EXECUTION_BLOCKED",
        result: "FAILED",
        reason: "UNEXPECTED_ERROR",
        requestId,
      },
    });
    return {
      status: "error",
      code: "FAILED",
      message: "Could not evaluate the deletion request.",
    };
  }

  if (!request) {
    await auditControlEvent({
      context,
      organizationId: context.sessionOrganizationId,
      action: "employee.deletion.execution_blocked",
      entityId: null,
      metadata: {
        operation: "EMPLOYEE_DELETION_EXECUTION_BLOCKED",
        result: "DENIED",
        reason: "NOT_FOUND",
        requestId,
      },
    });
    return {
      status: "error",
      code: "NOT_FOUND",
      message: "Deletion request not found.",
    };
  }

  if (request.status !== "approved") {
    await auditControlEvent({
      context,
      organizationId: request.organizationId,
      action: "employee.deletion.execution_blocked",
      entityId: request.employeeId,
      metadata: {
        operation: "EMPLOYEE_DELETION_EXECUTION_BLOCKED",
        result: "DENIED",
        reason: "NOT_APPROVED",
        requestId,
        employeeNumber: request.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "NOT_APPROVED",
      message: "The deletion request is not approved.",
    };
  }

  // The gate. While `DELETION_EXECUTION_ENABLED` is false this is the terminal
  // outcome for every approved request: refused, audited, nothing deleted.
  if (!isDeletionExecutionEnabled()) {
    await auditControlEvent({
      context,
      organizationId: request.organizationId,
      action: "employee.deletion.execution_blocked",
      entityId: request.employeeId,
      metadata: {
        operation: "EMPLOYEE_DELETION_EXECUTION_BLOCKED",
        result: "DENIED",
        reason: "EXECUTION_DISABLED",
        requestId,
        employeeNumber: request.employeeNumber,
      },
    });
    return {
      status: "error",
      code: "EXECUTION_DISABLED",
      message: DELETION_EXECUTION_DISABLED_MESSAGE,
    };
  }

  // Unreachable while DELETION_EXECUTION_ENABLED is false. Enabling the
  // executor is a separate reviewed change; no DELETE exists in this module.
  return {
    status: "error",
    code: "EXECUTION_DISABLED",
    message: DELETION_EXECUTION_DISABLED_MESSAGE,
  };
}
