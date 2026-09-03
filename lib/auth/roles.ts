/**
 * Centralized role catalog (RBAC, Phase 4).
 *
 * Role identifiers and their human-readable definitions live in exactly one
 * place so strings are never duplicated across the application.
 *
 * The system role catalog is: SUPERADMIN, ADMIN, MANAGEMENT, HR, FINANCE,
 * SUPERVISOR, EMPLOYEE. No other business roles are seeded.
 *
 * Organization model (see docs/rbac.md):
 * - A reserved `SYSTEM` organization hosts the system-level SUPERADMIN role.
 * - Every real organization hosts the six organization-level catalog roles
 *   (ADMIN … EMPLOYEE).
 * - A role's code is unique within its organization (database constraint).
 *   Authorization never matches role codes by name across organizations — it
 *   evaluates the roles actually granted to a user via `user_roles`.
 */

export const ROLE_CODES = {
  SUPERADMIN: "SUPERADMIN",
  ADMIN: "ADMIN",
  MANAGEMENT: "MANAGEMENT",
  HR: "HR",
  FINANCE: "FINANCE",
  SUPERVISOR: "SUPERVISOR",
  EMPLOYEE: "EMPLOYEE",
} as const;

export type RoleCode = (typeof ROLE_CODES)[keyof typeof ROLE_CODES];

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  description: string;
}

/** Reserved organization that owns system-level roles. */
export const SYSTEM_ORGANIZATION_CODE = "SYSTEM";
export const SYSTEM_ORGANIZATION_NAME = "System";

/** The platform-wide (system-level) role. Seeded only into the SYSTEM org. */
export const SUPERADMIN_ROLE_CODE = ROLE_CODES.SUPERADMIN;

/** Catalog roles seeded into every real (non-SYSTEM) organization. */
export const ORGANIZATION_ROLE_CODES: readonly RoleCode[] = [
  ROLE_CODES.ADMIN,
  ROLE_CODES.MANAGEMENT,
  ROLE_CODES.HR,
  ROLE_CODES.FINANCE,
  ROLE_CODES.SUPERVISOR,
  ROLE_CODES.EMPLOYEE,
];

/** Human-readable role catalog. */
export const ROLE_CATALOG: Record<RoleCode, RoleDefinition> = {
  [ROLE_CODES.SUPERADMIN]: {
    code: ROLE_CODES.SUPERADMIN,
    name: "Super Administrator",
    description:
      "System-level administration: unrestricted administrative access across the HRIS platform.",
  },
  [ROLE_CODES.ADMIN]: {
    code: ROLE_CODES.ADMIN,
    name: "Organization Administrator",
    description:
      "Organization-level administration of the HRIS and its operational configuration.",
  },
  [ROLE_CODES.MANAGEMENT]: {
    code: ROLE_CODES.MANAGEMENT,
    name: "Management",
    description:
      "Management dashboards, reports and organization-scoped visibility.",
  },
  [ROLE_CODES.HR]: {
    code: ROLE_CODES.HR,
    name: "Human Resources",
    description:
      "Employee and HR administration: records, attendance and leave administration.",
  },
  [ROLE_CODES.FINANCE]: {
    code: ROLE_CODES.FINANCE,
    name: "Finance",
    description:
      "Payroll and financial HRIS capabilities, payslips and financial reports.",
  },
  [ROLE_CODES.SUPERVISOR]: {
    code: ROLE_CODES.SUPERVISOR,
    name: "Supervisor",
    description:
      "Operational access to subordinate/team information and approvals.",
  },
  [ROLE_CODES.EMPLOYEE]: {
    code: ROLE_CODES.EMPLOYEE,
    name: "Employee",
    description: "Self-service access to your own HRIS records.",
  },
};

/** Whether a role code is a reserved catalog code (pre-seeded as system). */
export function isReservedRoleCode(code: string): code is RoleCode {
  return Object.prototype.hasOwnProperty.call(ROLE_CODES, code);
}
