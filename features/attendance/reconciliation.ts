/**
 * Attendance readiness reconciliation (PHASE 9.6) — PURE module.
 *
 * READ-ONLY operational visibility. This module does NOT make any attendance
 * decision and is NOT part of attendance enforcement:
 * - no GPS, no geolocation, no distance/Haversine computation, no camera, no
 *   Face Recognition, no attendance submission;
 * - no database access, no browser APIs, no authentication dependency;
 * - it only evaluates a denormalized, already organization-scoped snapshot.
 *
 * The authoritative chain evaluated is:
 *
 *   Employee
 *     → ACTIVE Project Assignment
 *     → ACTIVE Project
 *     → ACTIVE Work Location
 *     → Valid Work Location configuration
 *     → Attendance readiness
 *
 * Reconciliations reasons live in THIS module and are intentionally separate
 * from the attendance rejection-reason vocabulary (features/attendance/
 * rejection-reasons.ts). Existing rejection reason values are never touched.
 *
 * Work Location configuration completeness reuses the Phase 9.5 guardrail
 * (`isActiveWorkLocationComplete`) instead of duplicating the validation.
 * Multiple Work Locations per Project and multiple Employees per Project are
 * legitimate configurations — no uniqueness rules are introduced here.
 */

import { isActiveWorkLocationComplete } from "../work-locations/guardrails.ts";

/** Readiness health states shown to Management. */
export const RECONCILIATION_STATUSES = [
  "READY",
  "WARNING",
  "NOT_READY",
] as const;
export type ReconciliationStatus = (typeof RECONCILIATION_STATUSES)[number];

/**
 * Machine-readable reconciliation reasons (Phase 9.6 step 4).
 *
 * Deliberately distinct from attendance rejection reasons. Unknown/unexpected
 * states degrade to the safe `unknown_state` fallback and are never treated as
 * READY.
 */
export const RECONCILIATION_REASONS = [
  "ready",
  "employee_inactive",
  "no_active_assignment",
  "project_inactive",
  "no_active_work_location",
  "work_location_inactive",
  "work_location_incomplete",
  "no_active_employee_assignment",
  "unknown_state",
] as const;
export type ReconciliationReason = (typeof RECONCILIATION_REASONS)[number];

/** Human-readable labels for the reason values above. */
export const RECONCILIATION_REASON_LABELS: Record<
  ReconciliationReason,
  string
> = {
  ready: "Ready for attendance",
  employee_inactive: "Employee is inactive",
  no_active_assignment: "No active project assignment",
  project_inactive: "Project is not active",
  no_active_work_location: "No active Work Location",
  work_location_inactive: "Work Location is inactive",
  work_location_incomplete: "Work Location configuration incomplete",
  no_active_employee_assignment: "No active employee assignment",
  unknown_state: "Configuration state could not be determined",
};

/** Health state implied by each reconciliation reason. */
export const RECONCILIATION_REASON_STATUS: Record<
  ReconciliationReason,
  ReconciliationStatus
> = {
  ready: "READY",
  no_active_employee_assignment: "WARNING",
  employee_inactive: "NOT_READY",
  no_active_assignment: "NOT_READY",
  project_inactive: "NOT_READY",
  no_active_work_location: "NOT_READY",
  work_location_inactive: "NOT_READY",
  work_location_incomplete: "NOT_READY",
  unknown_state: "NOT_READY",
};

/** NOT_READY reasons that mean "this project has no usable active location". */
const PROJECT_LOCATION_REASONS: ReadonlySet<ReconciliationReason> =
  new Set([
    "no_active_work_location",
    "work_location_inactive",
    "work_location_incomplete",
  ]);

export const PROJECT_STATUS_ACTIVE = "active";
export const EMPLOYEE_STATUS_ACTIVE = "active";
export const WORK_LOCATION_STATUS_ACTIVE = "active";

export interface ReconciliationEmployee {
  id: string;
  employeeNumber: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
}

export interface ReconciliationAssignment {
  employeeId: string;
  projectId: string;
}

export interface ReconciliationProject {
  id: string;
  code: string;
  name: string;
  status: string;
}

export interface ReconciliationWorkLocation {
  id: string;
  projectId: string | null;
  name: string;
  status: string;
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number | null;
}

export interface ReconciliationSnapshot {
  employees: ReconciliationEmployee[];
  assignments: ReconciliationAssignment[];
  projects: ReconciliationProject[];
  workLocations: ReconciliationWorkLocation[];
}

/** One reconciliation dataset row (employee path or project/location WARNING). */
export interface ReconciliationRow {
  kind: "employee" | "condition";
  employeeId: string | null;
  employeeName: string;
  employeeNumber: string | null;
  projectId: string | null;
  projectName: string | null;
  workLocationId: string | null;
  workLocationName: string | null;
  /** "Active" = employee has an ACTIVE assignment; "None" otherwise. */
  assignment: "Active" | "None";
  status: ReconciliationStatus;
  reason: ReconciliationReason;
}

export interface ReconciliationFilters {
  status?: ReconciliationStatus | undefined;
  projectId?: string | undefined;
  employeeId?: string | undefined;
  workLocationId?: string | undefined;
}

/** Filters are null-safe: rows without the field never match a specific value. */
export function filterReconciliationRows(
  rows: readonly ReconciliationRow[],
  filters: ReconciliationFilters
): ReconciliationRow[] {
  return rows.filter((row) => {
    if (filters.status && row.status !== filters.status) return false;
    if (filters.projectId && row.projectId !== filters.projectId) return false;
    if (filters.employeeId && row.employeeId !== filters.employeeId) return false;
    if (filters.workLocationId && row.workLocationId !== filters.workLocationId)
      return false;
    return true;
  });
}

/**
 * Summary counts (Phase 9.6 step 10).
 *
 * The counts are always derived from the SAME row dataset that the detail list
 * renders (callers pass the already-filtered rows), so summary and list can
 * never disagree due to independent queries.
 */
export interface ReconciliationSummary {
  /** Employees with at least one READY path and no NOT_READY path. */
  readyEmployees: number;
  /** Employees with at least one NOT_READY path (incl. no assignment/inactive). */
  notReadyEmployees: number;
  /** WARNING condition rows (project/location without active assignment). */
  warningConditions: number;
  /** Distinct projects blocked by an unusable/missing active location. */
  projectsWithoutActiveWorkLocation: number;
  /** Distinct active work locations that no active employee may use. */
  workLocationsWithoutActiveEmployeeAssignment: number;
}

export function summarizeReconciliation(
  rows: readonly ReconciliationRow[]
): ReconciliationSummary {
  const employeesWithReady = new Set<string>();
  const employeesWithNotReady = new Set<string>();
  let warningConditions = 0;
  const projectsWithoutLocation = new Set<string>();
  const locationsWithoutAssignment = new Set<string>();

  for (const row of rows) {
    if (row.kind === "employee") {
      if (row.employeeId) {
        if (row.status === "READY") employeesWithReady.add(row.employeeId);
        if (row.status === "NOT_READY") employeesWithNotReady.add(row.employeeId);
      }
      if (
        row.status === "NOT_READY" &&
        PROJECT_LOCATION_REASONS.has(row.reason) &&
        row.projectId
      ) {
        projectsWithoutLocation.add(row.projectId);
      }
    } else {
      warningConditions += 1;
      if (row.reason === "no_active_employee_assignment" && row.workLocationId) {
        locationsWithoutAssignment.add(row.workLocationId);
      }
    }
  }

  const readyEmployees = [...employeesWithReady].filter(
    (employeeId) => !employeesWithNotReady.has(employeeId)
  ).length;

  return {
    readyEmployees,
    notReadyEmployees: employeesWithNotReady.size,
    warningConditions,
    projectsWithoutActiveWorkLocation: projectsWithoutLocation.size,
    workLocationsWithoutActiveEmployeeAssignment:
      locationsWithoutAssignment.size,
  };
}


/** Deterministic display name for an employee (never throws on missing data). */
function employeeDisplayName(employee: ReconciliationEmployee): string {
  const given = employee.firstName?.trim();
  const family = employee.lastName?.trim();
  if (given || family) return `${given ?? ""} ${family ?? ""}`.trim();
  return employee.employeeNumber?.trim() || "Unknown employee";
}

function isLocationUsable(location: ReconciliationWorkLocation): boolean {
  return (
    location.status === WORK_LOCATION_STATUS_ACTIVE &&
    isActiveWorkLocationComplete({
      status: location.status,
      projectId: location.projectId,
      latitude: location.latitude,
      longitude: location.longitude,
      radiusMeters: location.radiusMeters,
    })
  );
}

interface EmployeePathContext {
  projectsById: Map<string, ReconciliationProject>;
  activeAssignmentsByEmployee: Map<string, ReconciliationAssignment[]>;
  workLocationsByProject: Map<string, ReconciliationWorkLocation[]>;
}

function reconcileEmployeePaths(
  employee: ReconciliationEmployee,
  context: EmployeePathContext
): ReconciliationRow[] {
  const displayName = employeeDisplayName(employee);

  if (employee.employmentStatus !== EMPLOYEE_STATUS_ACTIVE) {
    return [
      {
        kind: "employee",
        employeeId: employee.id,
        employeeName: displayName,
        employeeNumber: employee.employeeNumber ?? null,
        projectId: null,
        projectName: null,
        workLocationId: null,
        workLocationName: null,
        assignment: "None",
        status: "NOT_READY",
        reason: "employee_inactive",
      },
    ];
  }

  const assignments =
    context.activeAssignmentsByEmployee.get(employee.id) ?? [];

  if (assignments.length === 0) {
    return [
      {
        kind: "employee",
        employeeId: employee.id,
        employeeName: displayName,
        employeeNumber: employee.employeeNumber ?? null,
        projectId: null,
        projectName: null,
        workLocationId: null,
        workLocationName: null,
        assignment: "None",
        status: "NOT_READY",
        reason: "no_active_assignment",
      },
    ];
  }

  return assignments.map((assignment) => {
    const base: ReconciliationRow = {
      kind: "employee",
      employeeId: employee.id,
      employeeName: displayName,
      employeeNumber: employee.employeeNumber ?? null,
      projectId: null,
      projectName: null,
      workLocationId: null,
      workLocationName: null,
      assignment: "Active",
      status: "NOT_READY",
      reason: "unknown_state",
    };

    const project = context.projectsById.get(assignment.projectId);
    if (!project || project.status !== PROJECT_STATUS_ACTIVE) {
      return { ...base, reason: "project_inactive" };
    }

    base.projectId = project.id;
    base.projectName = project.name;

    const projectLocations =
      context.workLocationsByProject.get(project.id) ?? [];
    const activeLocations = projectLocations.filter(
      (location) => location.status === WORK_LOCATION_STATUS_ACTIVE
    );
    const usableLocations = activeLocations.filter(isLocationUsable);

    if (usableLocations.length > 0) {
      const location = usableLocations[0];
      return {
        ...base,
        status: "READY",
        reason: "ready",
        workLocationId: location.id,
        workLocationName: location.name,
      };
    }

    if (activeLocations.length > 0) {
      // An ACTIVE location exists but none is fully configured for attendance.
      const location = activeLocations[0];
      return {
        ...base,
        reason: "work_location_incomplete",
        workLocationId: location.id,
        workLocationName: location.name,
      };
    }

    if (projectLocations.length > 0) {
      // Only INACTIVE locations are bound to the project.
      const location = projectLocations[0];
      return {
        ...base,
        reason: "work_location_inactive",
        workLocationId: location.id,
        workLocationName: location.name,
      };
    }

    return { ...base, reason: "no_active_work_location" };
  });
}


/**
 * Pure reconciliation engine (Phase 9.6 step 15).
 *
 * Deterministic and side-effect free. The input snapshot is expected to be
 * organization-scoped already (the server query layer guarantees this); the
 * engine never reads an `organizationId`.
 */
export function reconcileDataset(
  snapshot: ReconciliationSnapshot
): ReconciliationRow[] {
  const employees = snapshot.employees ?? [];
  const assignments = snapshot.assignments ?? [];
  const projects = snapshot.projects ?? [];
  const workLocations = snapshot.workLocations ?? [];

  const employeesById = new Map(
    employees.map((employee) => [employee.id, employee])
  );
  const projectsById = new Map(projects.map((project) => [project.id, project]));

  const activeAssignments = assignments.filter(
    (assignment) =>
      Boolean(assignment.employeeId) &&
      Boolean(assignment.projectId) &&
      employeesById.has(assignment.employeeId)
  );

  const activeAssignmentsByEmployee = new Map<string, ReconciliationAssignment[]>();
  const assignmentsByProject = new Map<string, ReconciliationAssignment[]>();
  for (const assignment of activeAssignments) {
    const employeeAssignments =
      activeAssignmentsByEmployee.get(assignment.employeeId) ?? [];
    employeeAssignments.push(assignment);
    activeAssignmentsByEmployee.set(assignment.employeeId, employeeAssignments);

    const projectAssignments =
      assignmentsByProject.get(assignment.projectId) ?? [];
    projectAssignments.push(assignment);
    assignmentsByProject.set(assignment.projectId, projectAssignments);
  }

  const workLocationsByProject = new Map<string, ReconciliationWorkLocation[]>();
  for (const location of workLocations) {
    if (!location.projectId) continue;
    const locations = workLocationsByProject.get(location.projectId) ?? [];
    locations.push(location);
    workLocationsByProject.set(location.projectId, locations);
  }

  const context: EmployeePathContext = {
    projectsById,
    activeAssignmentsByEmployee,
    workLocationsByProject,
  };

  const rows: ReconciliationRow[] = [];

  // Employee-path rows — each ACTIVE employee is evaluated per active
  // assignment so the exact broken link is visible.
  const sortedEmployees = [...employees].sort((a, b) =>
    employeeDisplayName(a).localeCompare(employeeDisplayName(b))
  );
  for (const employee of sortedEmployees) {
    rows.push(...reconcileEmployeePaths(employee, context));
  }

  // WARNING condition rows — ACTIVE projects/locations with no ACTIVE employee
  // assignment are operational warnings, never invalid configurations.
  const sortedProjects = [...projects]
    .filter((project) => project.status === PROJECT_STATUS_ACTIVE)
    .sort((a, b) => a.name.localeCompare(b.name));

  for (const project of sortedProjects) {
    const activeLocations = (workLocationsByProject.get(project.id) ?? [])
      .filter((location) => location.status === WORK_LOCATION_STATUS_ACTIVE)
      .sort((a, b) => a.name.localeCompare(b.name));

    if (activeLocations.length === 0) continue;

    const hasActiveEmployee = (assignmentsByProject.get(project.id) ?? []).some(
      (assignment) => {
        const employee = employeesById.get(assignment.employeeId);
        return (
          employee && employee.employmentStatus === EMPLOYEE_STATUS_ACTIVE
        );
      }
    );
    if (hasActiveEmployee) continue;

    for (const location of activeLocations) {
      rows.push({
        kind: "condition",
        employeeId: null,
        employeeName: "",
        employeeNumber: null,
        projectId: project.id,
        projectName: project.name,
        workLocationId: location.id,
        workLocationName: location.name,
        assignment: "None",
        status: "WARNING",
        reason: "no_active_employee_assignment",
      });
    }
  }

  // Deterministic ordering: employees first (by display name), then project,
  // then location. Condition rows (no employee) are grouped last.
  return rows.sort((a, b) => {
    const nameCompare = (a.employeeName || "\uffff").localeCompare(
      b.employeeName || "\uffff"
    );
    if (nameCompare !== 0) return nameCompare;
    const projectCompare = (a.projectName ?? "").localeCompare(
      b.projectName ?? ""
    );
    if (projectCompare !== 0) return projectCompare;
    return (a.workLocationName ?? "").localeCompare(b.workLocationName ?? "");
  });
}
