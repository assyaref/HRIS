/**
 * Assignment mutation rules (Phase 9.2) — PURE decision functions.
 *
 * These encode the security/business invariants of create/end assignment so
 * the server actions stay thin and the rules are unit-testable with the same
 * `node:test` foundation as the geofence engine. No DB access here: callers
 * (server actions) pass org-scoped rows that they fetched from the database.
 *
 * Every rule mirrors an existing convention:
 * - A record that does not belong to the actor's organization is reported as
 *   generic "not found" so cross-organization existence is never revealed.
 * - Only ACTIVE employees and ACTIVE projects may be linked.
 * - The database partial unique index (org, employee, project) WHERE
 *   `active = true` permits one active assignment per employee/project and
 *   multiple active assignments across different projects; we pre-check it to
 *   return a deterministic error instead of a raw unique violation.
 */

export type AssignmentGuardDecision =
  | { ok: true }
  | { ok: false; message: string };

export interface CreateAssignmentGuardContext {
  /** Authenticated user's organization (from session — never the client). */
  actorOrganizationId: string;
  employee: {
    id: string;
    organizationId: string;
    employmentStatus: string;
  } | null;
  project: {
    id: string;
    organizationId: string;
    status: string;
  } | null;
  /** True when (employee, project) already has an ACTIVE assignment. */
  existingActiveAssignment: boolean;
}

export function evaluateCreateAssignmentGuard(
  context: CreateAssignmentGuardContext
): AssignmentGuardDecision {
  const { employee, project } = context;

  if (!employee || employee.organizationId !== context.actorOrganizationId) {
    return { ok: false, message: "Employee not found." };
  }
  if (employee.employmentStatus !== "active") {
    return {
      ok: false,
      message: "Inactive employees cannot be assigned to projects.",
    };
  }

  if (!project || project.organizationId !== context.actorOrganizationId) {
    return { ok: false, message: "Project not found." };
  }
  if (project.status !== "active") {
    return {
      ok: false,
      message: "Only active projects can be assigned.",
    };
  }

  if (context.existingActiveAssignment) {
    return {
      ok: false,
      message: "This employee is already actively assigned to the project.",
    };
  }

  return { ok: true };
}

export interface EndAssignmentGuardContext {
  actorOrganizationId: string;
  assignment: {
    id: string;
    organizationId: string;
    active: boolean;
  } | null;
}

export function evaluateEndAssignmentGuard(
  context: EndAssignmentGuardContext
): AssignmentGuardDecision {
  const { assignment } = context;

  if (!assignment || assignment.organizationId !== context.actorOrganizationId) {
    return { ok: false, message: "Assignment not found." };
  }
  if (!assignment.active) {
    return {
      ok: false,
      message: "This assignment is already ended.",
    };
  }

  return { ok: true };
}
