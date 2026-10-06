/**
 * Organizations — CRUD safety policy (R19, pure and unit-testable).
 *
 * Pure decision logic — no `server-only`, no DB, no framework imports — so
 * the guardrails can be exercised with `node --test` (mirroring
 * `features/users/policy.ts` and `features/work-locations/guardrails.ts`).
 * The server actions call these AFTER authenticating the actor, verifying
 * the system-level SUPERADMIN role and loading the org-scoped row; they
 * answer "may this operation happen at all".
 */

import { SYSTEM_ORGANIZATION_CODE } from "../../lib/auth/roles.ts";

export type OrganizationOperation =
  | "update"
  | "delete"
  | "activate"
  | "deactivate";

export type OrganizationDecisionReason =
  | "superadmin.required"
  | "system.reserved"
  | "dependent.records"
  | "not.found";

export interface OrganizationDecision {
  allowed: boolean;
  reason?: OrganizationDecisionReason;
  message?: string;
}

export const ORGANIZATION_DECISION_MESSAGES: Record<
  OrganizationDecisionReason,
  string
> = {
  "superadmin.required":
    "Organization administration is restricted to Super Administrators.",
  "system.reserved":
    "The SYSTEM organization is reserved for platform roles and cannot be modified.",
  "dependent.records":
    "Organization cannot be deleted because it still contains dependent records.",
  "not.found": "Organization not found.",
};

/** Per-category dependency counts collected server-side before deletion. */
export type OrganizationDependencyCounts = Partial<
  Record<OrganizationDependencyCategory, number>
>;

export type OrganizationDependencyCategory =
  | "users"
  | "employees"
  | "roles"
  | "attendance"
  | "leave"
  | "permission_requests"
  | "payroll"
  | "payslips"
  | "payslip_documents"
  | "announcements"
  | "work_locations"
  | "projects"
  | "assignments"
  | "face_enrollments"
  | "audit";

function allow(): OrganizationDecision {
  return { allowed: true };
}

function deny(
  reason: OrganizationDecisionReason,
  message?: string
): OrganizationDecision {
  return {
    allowed: false,
    reason,
    message: message ?? ORGANIZATION_DECISION_MESSAGES[reason],
  };
}

export interface OrganizationActionContext {
  operation: OrganizationOperation;
  /** The target row's tenant code (loaded server-side from the DB row). */
  targetCode: string;
  /** Only the system-level SUPERADMIN role may reach these actions at all. */
  actorIsSuperAdmin: boolean;
  /** Counts of dependent rows per category (already org-scoped). */
  dependencyCounts?: OrganizationDependencyCounts;
}

/**
 * Decide whether an organization mutation may proceed.
 *
 * Rule order:
 * 1. SUPERADMIN-only — even a user holding one of the `organizations.*`
 *    permission codes must ALSO hold the system SUPERADMIN role (the actions
 *    enforce this first; this policy repeats it as defense in depth).
 * 2. The reserved SYSTEM organization is immutable (code identity + delete +
 *    deactivate). Editing its display name is the one allowed metadata
 *    change; everything else is refused.
 * 3. Deletion requires ZERO rows across every tracked category — protected
 *    historical/audit records included. Deactivation is the sanctioned
 *    alternative and remains available for orgs that still hold records.
 */
export function evaluateOrganizationAction(
  context: OrganizationActionContext
): OrganizationDecision {
  if (!context.actorIsSuperAdmin) {
    return deny("superadmin.required");
  }

  const isSystem = context.targetCode === SYSTEM_ORGANIZATION_CODE;

  if (isSystem && context.operation === "delete") {
    return deny("system.reserved");
  }

  if (isSystem && context.operation === "deactivate") {
    return deny("system.reserved");
  }

  if (context.operation === "delete") {
    const totals = summarizeDependencies(
      context.dependencyCounts ?? {}
    );
    if (totals.hasAny) {
      return deny("dependent.records");
    }
  }

  return allow();
}

export interface DependencySummary {
  hasAny: boolean;
  /** Categories with a non-zero count, in the canonical display order. */
  categories: Array<{ category: OrganizationDependencyCategory; count: number }>;
  total: number;
}

const DEPENDENCY_ORDER: readonly OrganizationDependencyCategory[] = [
  "users",
  "employees",
  "roles",
  "attendance",
  "leave",
  "permission_requests",
  "payroll",
  "payslips",
  "payslip_documents",
  "announcements",
  "work_locations",
  "projects",
  "assignments",
  "face_enrollments",
  "audit",
];

/** Aggregate per-category counts into the list/detail/delete view model. */
export function summarizeDependencies(
  counts: OrganizationDependencyCounts
): DependencySummary {
  const categories: DependencySummary["categories"] = [];
  let total = 0;
  for (const category of DEPENDENCY_ORDER) {
    const count = counts[category] ?? 0;
    if (count > 0) {
      categories.push({ category, count });
      total += count;
    }
  }
  return { hasAny: total > 0, categories, total };
}

/** True when the operation is the create/duplicate path (code/name collision). */
export function isDuplicateOrganizationError(unknownError: unknown): boolean {
  return (
    typeof unknownError === "object" &&
    unknownError !== null &&
    "code" in unknownError &&
    (unknownError as { code?: unknown }).code === "23505"
  );
}

/**
 * Whether an update may change a given field on a target row. The SYSTEM
 * organization's `code` and `status` are frozen; `name` may be corrected.
 */
export function allowsSystemFieldChange(
  field: "code" | "name" | "status",
  targetCode: string
): boolean {
  if (targetCode !== SYSTEM_ORGANIZATION_CODE) return true;
  return field === "name";
}
