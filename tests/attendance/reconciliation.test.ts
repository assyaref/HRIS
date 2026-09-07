/**
 * PHASE 9.6 — Attendance readiness reconciliation tests (node:test).
 *
 * Exercises the PURE reconciliation engine in
 * `features/attendance/reconciliation.ts`. No DB, no GPS, no camera, no Face
 * Recognition, no attendance submission.
 *
 * Organization-boundary enforcement lives in the server query layer
 * (`reconciliation.queries.ts`, org-scoped SQL keyed to the authenticated
 * session) and is NOT part of this pure module. Reconciliations are a
 * READ-ONLY diagnostic; they never change assignments or work locations.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  filterReconciliationRows,
  reconcileDataset,
  summarizeReconciliation,
  type ReconciliationRow,
  type ReconciliationProject,
  type ReconciliationSnapshot,
  type ReconciliationWorkLocation,
} from "../../features/attendance/reconciliation.ts";

const PROJECT_DURI = "11111111-1111-4111-8111-111111111111";
const PROJECT_DURI_2 = "22222222-2222-4222-8222-222222222222";
const PROJECT_WAREHOUSE = "33333333-3333-4333-8333-333333333333";
const PROJECT_INACTIVE = "44444444-4444-4444-8444-444444444444";
const PROJECT_COMPLETED = "55555555-5555-4555-8555-555555555555";

const BUDI = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ANDI = "aaaaaaa2-aaaa-4aaa-8aaa-aaaaaaaaaaa2";
const DIAN = "aaaaaaa4-aaaa-4aaa-8aaa-aaaaaaaaaaa4";

const LOC_DURI_OFFICE = "bbbbbbb1-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
const LOC_DURI_B = "bbbbbbb2-bbbb-4bbb-8bbb-bbbbbbbbbbb2";
const LOC_WAREHOUSE = "bbbbbbb3-bbbb-4bbb-8bbb-bbbbbbbbbbb3";

function employee(
  id: string,
  number = "EMP",
  firstName = "Employee",
  lastName = "One",
  employmentStatus = "active"
) {
  return { id, employeeNumber: number, firstName, lastName, employmentStatus };
}

function project(id: string, name: string, status = "active"): ReconciliationProject {
  return { id, code: name.replace(/\s+/g, "_").toUpperCase(), name, status };
}

function location(
  id: string,
  projectId: string,
  name: string,
  overrides: Partial<ReconciliationWorkLocation> = {}
): ReconciliationWorkLocation {
  return {
    id,
    projectId,
    name,
    status: "active",
    latitude: -6.2088,
    longitude: 106.8456,
    radiusMeters: 100,
    ...overrides,
  };
}

function snapshot(input: Partial<ReconciliationSnapshot> = {}): ReconciliationSnapshot {
  return {
    employees: input.employees ?? [],
    assignments: input.assignments ?? [],
    projects: input.projects ?? [],
    workLocations: input.workLocations ?? [],
  };
}

const projectDuri = project(PROJECT_DURI, "Project Duri");
const projectDuri2 = project(PROJECT_DURI_2, "Project Duri 2");
const projectWarehouse = project(PROJECT_WAREHOUSE, "Warehouse Project");
const projectInactive = project(PROJECT_INACTIVE, "Dormant Project", "inactive");
const projectCompleted = project(PROJECT_COMPLETED, "Finished Project", "completed");

function employeeRows(rows: ReconciliationRow[]) {
  return rows.filter((row) => row.kind === "employee");
}

describe("Single employee paths", () => {
  it("classifies a fully ready employee as READY", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_DURI }],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    assert.equal(rows.length, 1);
    const row = rows[0];
    assert.equal(row.kind, "employee");
    assert.equal(row.employeeId, BUDI);
    assert.equal(row.projectId, PROJECT_DURI);
    assert.equal(row.workLocationId, LOC_DURI_OFFICE);
    assert.equal(row.assignment, "Active");
    assert.equal(row.status, "READY");
    assert.equal(row.reason, "ready");

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.readyEmployees, 1);
    assert.equal(summary.notReadyEmployees, 0);
    assert.equal(summary.warningConditions, 0);
  });

  it("classifies an inactive employee as NOT_READY (employee_inactive)", () => {
    const dian = employee(DIAN, "E004", "Dian", "Kusuma", "inactive");
    const rows = reconcileDataset(
      snapshot({
        employees: [dian],
        assignments: [{ employeeId: DIAN, projectId: PROJECT_DURI }],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    const employeeRowsForDian = employeeRows(rows);
    assert.equal(employeeRowsForDian.length, 1);
    assert.equal(employeeRowsForDian[0].status, "NOT_READY");
    assert.equal(employeeRowsForDian[0].reason, "employee_inactive");

    // The project has a usable location but no ACTIVE employee → WARNING too.
    assert.equal(summarizeReconciliation(rows).warningConditions, 1);
  });

  it("classifies an active employee with no active assignment as NOT_READY", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    const employeeRowsForBudi = employeeRows(rows);
    assert.equal(employeeRowsForBudi.length, 1);
    assert.equal(employeeRowsForBudi[0].status, "NOT_READY");
    assert.equal(employeeRowsForBudi[0].reason, "no_active_assignment");
    assert.equal(employeeRowsForBudi[0].assignment, "None");

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.notReadyEmployees, 1);
    assert.equal(summary.warningConditions, 1);
  });

  it("evaluates an ACTIVE assignment + ACTIVE project + valid ACTIVE location as READY", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_DURI }],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    const row = employeeRows(rows)[0];
    assert.equal(row.status, "READY");
    assert.equal(row.assignment, "Active");
  });

  it("reports project_inactive when the assigned project is inactive", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_INACTIVE }],
        projects: [projectInactive],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_INACTIVE, "Site Office Duri"),
        ],
      })
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "NOT_READY");
    assert.equal(rows[0].reason, "project_inactive");
  });

  it("treats a completed project like an inactive one (not ready)", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_COMPLETED }],
        projects: [projectCompleted],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_COMPLETED, "Finished Office"),
        ],
      })
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "NOT_READY");
    assert.equal(rows[0].reason, "project_inactive");
  });

  it("reports no_active_work_location for an active project without locations", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_DURI }],
        projects: [projectDuri],
      })
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "NOT_READY");
    assert.equal(rows[0].reason, "no_active_work_location");

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.projectsWithoutActiveWorkLocation, 1);
  });

  it("reports work_location_inactive when only an inactive location exists", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_DURI }],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Old Office", {
            status: "inactive",
          }),
        ],
      })
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "NOT_READY");
    assert.equal(rows[0].reason, "work_location_inactive");
  });

  it("reports work_location_incomplete for an active but incomplete location", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_DURI }],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Half Configured", {
            latitude: null,
            radiusMeters: null,
          }),
        ],
      })
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "NOT_READY");
    assert.equal(rows[0].reason, "work_location_incomplete");
    assert.equal(rows[0].workLocationId, LOC_DURI_OFFICE);
  });
});


describe("Multiple work locations and employees", () => {
  it("allows multiple valid ACTIVE locations per project without conflicts", () => {
    const budi = employee(BUDI, "E001", "Budi", "Santoso");
    const rows = reconcileDataset(
      snapshot({
        employees: [budi],
        assignments: [{ employeeId: BUDI, projectId: PROJECT_DURI }],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
          location(LOC_DURI_B, PROJECT_DURI, "Warehouse Duri"),
        ],
      })
    );

    // One employee → one READY row; the project is NOT conflicting/invalid.
    assert.equal(employeeRows(rows).length, 1);
    assert.equal(rows[0].status, "READY");
    assert.equal(rows[0].reason, "ready");

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.warningConditions, 0);
    assert.equal(summary.projectsWithoutActiveWorkLocation, 0);
  });

  it("evaluates each employee independently on a shared project", () => {
    const rows = reconcileDataset(
      snapshot({
        employees: [
          employee(BUDI, "E001", "Budi", "Santoso"),
          employee(ANDI, "E002", "Andi", "Wijaya"),
        ],
        assignments: [
          { employeeId: BUDI, projectId: PROJECT_DURI },
          { employeeId: ANDI, projectId: PROJECT_DURI },
        ],
        projects: [projectDuri],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    assert.equal(employeeRows(rows).length, 2);
    assert.ok(rows.every((row) => row.status === "READY"));
    assert.equal(rows.every((row) => row.employeeId === BUDI || row.employeeId === ANDI), true);

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.readyEmployees, 2);
  });

  it("shows each employee's exact broken link independently", () => {
    const rows = reconcileDataset(
      snapshot({
        employees: [
          employee(BUDI, "E001", "Budi", "Santoso"),
          employee(ANDI, "E002", "Andi", "Wijaya"),
        ],
        assignments: [
          { employeeId: BUDI, projectId: PROJECT_DURI },
          { employeeId: ANDI, projectId: PROJECT_DURI_2 },
        ],
        projects: [projectDuri, projectDuri2],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    const budiRow = employeeRows(rows).find((row) => row.employeeId === BUDI);
    const andiRow = employeeRows(rows).find((row) => row.employeeId === ANDI);
    assert.equal(budiRow?.status, "READY");
    assert.equal(andiRow?.status, "NOT_READY");
    assert.equal(andiRow?.reason, "no_active_work_location");

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.readyEmployees, 1);
    assert.equal(summary.notReadyEmployees, 1);

describe("Mixed dataset, determinism and edge cases", () => {
  it("produces a mixed READY/WARNING/NOT_READY dataset and consistent summary", () => {
    const rows = reconcileDataset(
      snapshot({
        employees: [
          employee(BUDI, "E001", "Budi", "Santoso"),
          employee(ANDI, "E002", "Andi", "Wijaya"),
        ],
        assignments: [
          { employeeId: BUDI, projectId: PROJECT_DURI },
          { employeeId: ANDI, projectId: PROJECT_DURI_2 },
        ],
        projects: [projectDuri, projectDuri2, projectWarehouse],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
          location(LOC_WAREHOUSE, PROJECT_WAREHOUSE, "Warehouse"),
        ],
      })
    );

    const statuses = rows.map((row) => row.status);
    assert.ok(statuses.includes("READY"));
    assert.ok(statuses.includes("NOT_READY"));
    assert.ok(statuses.includes("WARNING"));

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.readyEmployees, 1);
    assert.equal(summary.notReadyEmployees, 1);
    assert.equal(summary.warningConditions, 1);
    assert.equal(summary.projectsWithoutActiveWorkLocation, 1);
    assert.equal(summary.workLocationsWithoutActiveEmployeeAssignment, 1);
  });

  it("is deterministic: identical input → identical output", () => {
    const input = snapshot({
      employees: [
        employee(BUDI, "E001", "Budi", "Santoso"),
        employee(ANDI, "E002", "Andi", "Wijaya"),
        employee(DIAN, "E004", "Dian", "Kusuma", "inactive"),
      ],
      assignments: [
        { employeeId: BUDI, projectId: PROJECT_DURI },
        { employeeId: ANDI, projectId: PROJECT_DURI_2 },
      ],
      projects: [projectDuri, projectDuri2, projectWarehouse],
      workLocations: [
        location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        location(LOC_WAREHOUSE, PROJECT_WAREHOUSE, "Warehouse"),
      ],
    });

    assert.deepEqual(reconcileDataset(input), reconcileDataset(input));
    assert.deepEqual(
      summarizeReconciliation(reconcileDataset(input)),
      summarizeReconciliation(reconcileDataset(input))
    );
  });

  it("handles an empty dataset safely", () => {
    const rows = reconcileDataset(
      snapshot({ employees: [], assignments: [], projects: [], workLocations: [] })
    );
    assert.deepEqual(rows, []);
    assert.deepEqual(summarizeReconciliation(rows), {
      readyEmployees: 0,
      notReadyEmployees: 0,
      warningConditions: 0,
      projectsWithoutActiveWorkLocation: 0,
      workLocationsWithoutActiveEmployeeAssignment: 0,
    });
  });

  it("handles malformed/incomplete input safely", () => {
    // An assignment pointing at a missing project fails safely (NOT_READY),
    // missing names degrade to placeholders, and an orphaned location with no
    // project is ignored without throwing.
    const rows = reconcileDataset(
      snapshot({
        employees: [
          {
            id: BUDI,
            employeeNumber: "E001",
            firstName: "",
            lastName: "",
            employmentStatus: "active",
          },
        ],
        assignments: [{ employeeId: BUDI, projectId: "missing-project" }],
        projects: [],
        workLocations: [
          location(LOC_WAREHOUSE, "", "Orphan Location"),
          location(LOC_DURI_OFFICE, PROJECT_DURI, "No Radius", {
            radiusMeters: null,
          }),
        ],
      })
    );

    assert.equal(rows.length, 1);
    assert.equal(rows[0].employeeId, BUDI);
    assert.equal(rows[0].status, "NOT_READY");
    assert.equal(rows[0].reason, "project_inactive");
    assert.equal(rows[0].employeeName, "E001");
  });

  it("derives summary from the same filtered row dataset", () => {
    const rows = reconcileDataset(
      snapshot({
        employees: [
          employee(BUDI, "E001", "Budi", "Santoso"),
          employee(ANDI, "E002", "Andi", "Wijaya"),
        ],
        assignments: [
          { employeeId: BUDI, projectId: PROJECT_DURI },
          { employeeId: ANDI, projectId: PROJECT_DURI_2 },
        ],
        projects: [projectDuri, projectDuri2],
        workLocations: [
          location(LOC_DURI_OFFICE, PROJECT_DURI, "Site Office Duri"),
        ],
      })
    );

    const filtered = filterReconciliationRows(rows, {
      status: "NOT_READY",
    });
    assert.equal(filtered.length, 1);
    const summary = summarizeReconciliation(filtered);
    assert.equal(summary.readyEmployees, 0);
    assert.equal(summary.notReadyEmployees, 1);

    // Project filter keeps only rows bound to that project.
    const projectRows = filterReconciliationRows(rows, {
      projectId: PROJECT_DURI,
    });
    assert.equal(projectRows.length, 1);
    assert.equal(projectRows[0].employeeId, BUDI);
  });
});

    assert.equal(summary.projectsWithoutActiveWorkLocation, 1);
  });
});

describe("Project without active employees (WARNING)", () => {
  it("warns when an active project/location has zero active employee assignments", () => {
    const rows = reconcileDataset(
      snapshot({
        projects: [projectWarehouse],
        workLocations: [
          location(LOC_WAREHOUSE, PROJECT_WAREHOUSE, "Warehouse"),
        ],
      })
    );

    // The location is NOT marked invalid, only warned.
    assert.equal(rows.length, 1);
    assert.equal(rows[0].status, "WARNING");
    assert.equal(rows[0].reason, "no_active_employee_assignment");
    assert.equal(rows[0].kind, "condition");

    const summary = summarizeReconciliation(rows);
    assert.equal(summary.warningConditions, 1);
    assert.equal(summary.workLocationsWithoutActiveEmployeeAssignment, 1);
    assert.equal(summary.readyEmployees, 0);
    assert.equal(summary.notReadyEmployees, 0);
  });

  it("emits one WARNING row per active location without an active employee", () => {
    const rows = reconcileDataset(
      snapshot({
        projects: [projectWarehouse],
        workLocations: [
          location(LOC_WAREHOUSE, PROJECT_WAREHOUSE, "Warehouse"),
          location(LOC_DURI_OFFICE, PROJECT_WAREHOUSE, "Office"),
        ],
      })
    );

    const warnings = rows.filter((row) => row.status === "WARNING");
    assert.equal(warnings.length, 2);
    const summary = summarizeReconciliation(rows);
    assert.equal(summary.workLocationsWithoutActiveEmployeeAssignment, 2);
  });
});
