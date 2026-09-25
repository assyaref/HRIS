/**
 * Employee module constants (Phase 5).
 *
 * The employees schema defines an application-level status contract of
 * `active | inactive` (see db/schema/employees.ts). No larger status system is
 * invented here — leave management phases will extend the lifecycle later.
 */

export const EMPLOYEE_STATUSES = ["active", "inactive"] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  active: "Active",
  inactive: "Inactive",
};

/** Whether a raw string (e.g. from the DB or a form) is a valid status. */
export function isEmployeeStatus(value: string): value is EmployeeStatus {
  return (EMPLOYEE_STATUSES as readonly string[]).includes(value);
}

/** Application-level employment-type contract (Excel dropdowns + validation). */
export const EMPLOYMENT_TYPES = [
  "Probation",
  "Contract",
  "Permanent",
  "Daily",
  "Internship",
  "Freelance",
] as const;

export type EmploymentType = (typeof EMPLOYMENT_TYPES)[number];

export function isEmploymentType(value: string): value is EmploymentType {
  return (EMPLOYMENT_TYPES as readonly string[]).includes(
    value as EmploymentType
  );
}

/** Application-level gender contract used by Excel dropdowns/validation. */
export const GENDERS = ["Male", "Female"] as const;

export function isGender(value: string): boolean {
  return (GENDERS as readonly string[]).some(
    (gender) => gender.toLowerCase() === value.toLowerCase()
  );
}
