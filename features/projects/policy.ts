/**
 * Projects — CRUD safety policy (pure and unit-testable).
 *
 * Pure decision logic — no `server-only`, no DB, no framework imports — so
 * the guardrails can be exercised with `node --test` (mirroring
 * `features/organizations/policy.ts`). The server actions call these AFTER
 * authenticating the actor, verifying the system-level SUPERADMIN role and
 * loading the target row from PostgreSQL; they answer "may this operation
 * happen at all".
 *
 * Rules enforced here (defense in depth — the actions re-check everything):
 * 1. Every project CRUD operation is SUPERADMIN-only. The `projects.*`
 *    permission codes remain in the catalog for expressibility, but they are
 *    never sufficient on their own.
 * 2. Hard deletion requires ZERO dependent rows across every tracked category
 *    (assignments — active or ended, attendance records, work locations).
 *    History is protected; deactivation (status change) is the sanctioned
 *    alternative for projects that still hold records.
 * 3. Moving a project to another organization is only allowed while the
 *    project holds no dependent rows: assignments require the employee and
 *    the project to live in the same organization, so a move with existing
 *    assignments/attendance/work locations would silently break organization
 *    isolation across HRIS modules.
 */

export type ProjectOperation = "create" | "update" | "delete" | "status_change";

export type ProjectDecisionReason =
  | "superadmin.required"
  | "dependent.records"
  | "organization.change.blocked"
  | "not.found";

export interface ProjectDecision {
  allowed: boolean;
  reason?: ProjectDecisionReason;
  message?: string;
}

export const PROJECT_DECISION_MESSAGES: Record<ProjectDecisionReason, string> =
  {
    "superadmin.required":
      "Project administration is restricted to Super Administrators.",
    "dependent.records":
      "Project cannot be deleted because it is still referenced by other records.",
    "organization.change.blocked":
      "The project cannot be moved to another organization while it is referenced by assignments, attendance records or work locations.",
    "not.found": "Project not found.",
  };

/** Per-category dependency counts collected server-side before a decision. */
export type ProjectDependencyCategory =
  | "assignments"
  | "attendance"
  | "work_locations";

export type ProjectDependencyCounts = Partial<
  Record<ProjectDependencyCategory, number>
>;

function allow(): ProjectDecision {
  return { allowed: true };
}

function deny(
  reason: ProjectDecisionReason,
  message?: string
): ProjectDecision {
  return {
    allowed: false,
    reason,
    message: message ?? PROJECT_DECISION_MESSAGES[reason],
  };
}

export interface ProjectDeleteContext {
  /** Only the system-level SUPERADMIN role may delete a project. */
  actorIsSuperAdmin: boolean;
  /** Counts of dependent rows per category (loaded server-side). */
  dependencyCounts: ProjectDependencyCounts;
}

/**
 * Decide whether a project deletion may proceed.
 *
 * Deletion is hard (the schema has no `deleted_at` on `projects`): it is
 * allowed only when NO dependent row exists anywhere. Any FK violation at
 * delete time is mapped to the same refusal by the action.
 */
export function evaluateProjectDelete(
  context: ProjectDeleteContext
): ProjectDecision {
  if (!context.actorIsSuperAdmin) {
    return deny("superadmin.required");
  }

  const summary = summarizeProjectDependencies(context.dependencyCounts);
  if (summary.hasAny) {
    return deny("dependent.records");
  }

  return allow();
}

export interface ProjectOrganizationChangeContext {
  actorIsSuperAdmin: boolean;
  /** Counts of dependent rows per category (loaded server-side). */
  dependencyCounts: ProjectDependencyCounts;
}

/**
 * Decide whether a project may be moved to a different organization.
 *
 * Blocked while ANY dependent row exists — ended assignments included,
 * because the historical rows would survive pointing at a project that no
 * longer belongs to the employee's organization.
 */
export function evaluateProjectOrganizationChange(
  context: ProjectOrganizationChangeContext
): ProjectDecision {
  if (!context.actorIsSuperAdmin) {
    return deny("superadmin.required");
  }

  const summary = summarizeProjectDependencies(context.dependencyCounts);
  if (summary.hasAny) {
    return deny("organization.change.blocked");
  }

  return allow();
}

export interface ProjectDependencySummary {
  hasAny: boolean;
  /** Categories with a non-zero count, in the canonical display order. */
  categories: Array<{
    category: ProjectDependencyCategory;
    count: number;
  }>;
  total: number;
}

const PROJECT_DEPENDENCY_ORDER: readonly ProjectDependencyCategory[] = [
  "assignments",
  "attendance",
  "work_locations",
];

/** Aggregate per-category counts into the delete/organization-change copy. */
export function summarizeProjectDependencies(
  counts: ProjectDependencyCounts
): ProjectDependencySummary {
  const categories: ProjectDependencySummary["categories"] = [];
  let total = 0;
  for (const category of PROJECT_DEPENDENCY_ORDER) {
    const count = counts[category] ?? 0;
    if (count > 0) {
      categories.push({ category, count });
      total += count;
    }
  }
  return { hasAny: total > 0, categories, total };
}

/** Human-readable labels for the dependency categories. */
export const PROJECT_DEPENDENCY_CATEGORY_LABELS: Record<
  ProjectDependencyCategory,
  string
> = {
  assignments: "Employee assignments",
  attendance: "Attendance records",
  work_locations: "Work locations",
};

/** True when the operation hit the unique (organization_id, code) constraint. */
export function isDuplicateProjectError(unknownError: unknown): boolean {
  return (
    typeof unknownError === "object" &&
    unknownError !== null &&
    "code" in unknownError &&
    (unknownError as { code?: unknown }).code === "23505"
  );
}

/** True when the delete hit a foreign-key violation (a dependent appeared). */
export function isForeignKeyViolation(unknownError: unknown): boolean {
  return (
    typeof unknownError === "object" &&
    unknownError !== null &&
    "code" in unknownError &&
    (unknownError as { code?: unknown }).code === "23503"
  );
}

/** Strict UUID check — target ids are never trusted from the client. */
export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}
