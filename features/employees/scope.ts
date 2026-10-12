/**
 * Employee list scope resolution (PURE module).
 *
 * No database, no `server-only`, no Next.js imports, so the tenant-isolation
 * rules are unit-testable with `node --test` exactly like the validation layer.
 *
 * The page and the export route share these helpers: the effective
 * organization is decided once, server-side, and the URL is only ever a
 * *request* — never authority. A non-Super Administrator can never leave their
 * own organization no matter what `org`/`projectId` they submit.
 */

import { UUID_PATTERN } from "./schemas.ts";

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export interface EmployeeScopeInput {
  /** Raw `org` query parameter (already trimmed by the caller). */
  requestedOrganizationId?: string | null;
  /** The authenticated user's own organization (from the session). */
  userOrganizationId: string | null;
  /** Whether the caller holds the system-level SUPERADMIN role. */
  isSuperAdmin: boolean;
  /**
   * Whether the requested organization exists AND is active. The caller
   * resolves this from the database; a `false` value is treated as "no
   * selection" so a stale/deactivated tenant can never be viewed.
   */
  requestedOrganizationIsActive: boolean;
}

export interface EmployeeScope {
  /** The organization whose employees will actually be read. */
  organizationId: string | null;
  /** True only when a SUPERADMIN is looking at a different tenant. */
  viewingOtherOrganization: boolean;
}

/**
 * Resolve which organization the employee list reads from.
 *
 * - No session organization → no scope (the page forbids this anyway).
 * - Non-Super Administrator → ALWAYS their own organization; the requested id
 *   is ignored outright, so URL tampering cannot cross tenants.
 * - Super Administrator → the requested organization, but only when it is a
 *   well-formed UUID for an existing, ACTIVE organization. Otherwise the
 *   caller's own organization (never an arbitrary fallback).
 */
export function resolveEmployeeScope(input: EmployeeScopeInput): EmployeeScope {
  const { userOrganizationId } = input;
  if (!userOrganizationId) {
    return { organizationId: null, viewingOtherOrganization: false };
  }

  const requested = input.requestedOrganizationId?.trim();
  if (
    input.isSuperAdmin &&
    requested &&
    isUuid(requested) &&
    input.requestedOrganizationIsActive
  ) {
    return {
      organizationId: requested,
      viewingOtherOrganization: requested !== userOrganizationId,
    };
  }

  return { organizationId: userOrganizationId, viewingOtherOrganization: false };
}

export interface EmployeeDetailScopeInput {
  /**
   * The organization that owns the employee record, read from the database.
   * This value is AUTHORITATIVE: it is never taken from the request.
   */
  employeeOrganizationId: string;
  /** The authenticated user's own organization (from the session). */
  userOrganizationId: string | null;
  /** Whether the caller holds the system-level SUPERADMIN role. */
  isSuperAdmin: boolean;
  /**
   * Raw `org` query parameter (URL context), already trimmed. Only ever a
   * consistency assertion — it can never widen access.
   */
  requestedOrganizationId?: string | null;
}

export interface EmployeeDetailScope {
  /** The organization whose employee data may be read. */
  organizationId: string;
  /** True only when a SUPERADMIN is looking at a different tenant. */
  viewingOtherOrganization: boolean;
}

/**
 * Resolve whether the caller may read ONE employee detail, and in which
 * organization's scope.
 *
 * The employee's OWN organization (read from the record, not the browser) is
 * authoritative. Returns `null` (the caller responds with forbidden) when:
 *  - the session has no organization;
 *  - the employee belongs to another tenant and the caller is not a Super
 *    Administrator (tenant isolation, unaffected by URL tampering);
 *  - a URL `org` context was supplied that does NOT match the employee's
 *    owning organization (an inconsistent context is refused, never followed).
 *
 * A Super Administrator viewing another tenant's employee is reported through
 * `viewingOtherOrganization`, which callers use to render the page read-only
 * while the write actions stay scoped to the session organization.
 */
export function resolveEmployeeDetailScope(
  input: EmployeeDetailScopeInput
): EmployeeDetailScope | null {
  const { userOrganizationId, employeeOrganizationId } = input;
  if (!userOrganizationId || !isUuid(employeeOrganizationId)) return null;

  const isOwnOrganization = employeeOrganizationId === userOrganizationId;
  if (!isOwnOrganization && !input.isSuperAdmin) return null;

  const requested = input.requestedOrganizationId?.trim();
  if (requested && requested !== employeeOrganizationId) return null;

  return {
    organizationId: employeeOrganizationId,
    viewingOtherOrganization: !isOwnOrganization,
  };
}

export interface ProjectScopeInput {
  /** Raw `projectId` query parameter. */
  requestedProjectId?: string | null;
  /**
   * Whether the requested project actually belongs to the resolved
   * organization. The caller proves this with an organization-scoped database
   * lookup; `false` resets the selection.
   */
  projectBelongsToOrganization: boolean;
}

/**
 * Resolve the effective project filter.
 *
 * Returns `null` (no project filter) unless the id is a well-formed UUID AND
 * the project belongs to the currently selected organization. This is what
 * makes "changing the organization resets a now-invalid project" automatic:
 * the lookup is done against the NEW organization.
 */
export function resolveSelectedProjectId(
  input: ProjectScopeInput
): string | null {
  const requested = input.requestedProjectId?.trim();
  if (!requested || !isUuid(requested) || !input.projectBelongsToOrganization) {
    return null;
  }
  return requested;
}
