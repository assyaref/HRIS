import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const root = join(import.meta.dirname, "..", "..");
const nav = readFileSync(join(root, "components/layout/navigation.ts"), "utf8");
const page = (p: string) => readFileSync(join(root, "app/(dashboard)", p, "page.tsx"), "utf8");
const entry = (href: string) => {
  const at = nav.indexOf(`href: "${href}"`);
  assert.notEqual(at, -1, `${href} missing from navigation`);
  return nav.slice(at, nav.indexOf("}", at));
};

describe("reference modules: navigation matches page guards", () => {
  it("/approvals: any leave/permission approve or manage", () => {
    const item = entry("/approvals");
    for (const code of ["LEAVE_APPROVE", "LEAVE_MANAGE", "PERMISSION_APPROVE", "PERMISSION_MANAGE"]) {
      assert.match(item, new RegExp(`PERMISSIONS\\.${code}`));
      assert.match(page("approvals"), new RegExp(`PERMISSIONS\\.${code}`));
    }
    assert.match(page("approvals"), /forbidden\(\)/);
  });

  it("/monitoring/contracts: employees.view AND employment view", () => {
    const item = entry("/monitoring/contracts");
    assert.match(item, /permission: PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW/);
    assert.match(item, /anyPermission: \[PERMISSIONS\.EMPLOYEES_VIEW\]/);
    const guard = page("monitoring/contracts");
    assert.match(guard, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
    assert.match(guard, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW\)/);
  });

  it("reports require reports.view", () => {
    for (const href of ["/reports/employees", "/reports/leave"]) {
      assert.match(entry(href), /permission: PERMISSIONS\.REPORTS_VIEW/);
      assert.match(page(href.slice(1)), /requirePermission\(user\.id, PERMISSIONS\.REPORTS_VIEW\)/);
    }
  });

  it("/settings/audit-trail requires audit.view", () => {
    assert.match(entry("/settings/audit-trail"), /permission: PERMISSIONS\.AUDIT_VIEW/);
    assert.match(page("settings/audit-trail"), /requirePermission\(user\.id, PERMISSIONS\.AUDIT_VIEW\)/);
  });

  it("/organization/chart requires employees.view", () => {
    assert.match(entry("/organization/chart"), /permission: PERMISSIONS\.EMPLOYEES_VIEW/);
    assert.match(page("organization/chart"), /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
  });

  it("/approvals also opens for overtime approvers", () => {
    const item = entry("/approvals");
    for (const code of ["ATTENDANCE_APPROVE", "ATTENDANCE_MANAGE"]) {
      assert.match(item, new RegExp(`PERMISSIONS\\.${code}`));
      assert.match(page("approvals"), new RegExp(`PERMISSIONS\\.${code}`));
    }
  });

  it("time management entries mirror their page guards", () => {
    assert.match(entry("/time/calendar"), /permission: PERMISSIONS\.ATTENDANCE_VIEW/);
    assert.match(entry("/time/shifts"), /permission: PERMISSIONS\.ATTENDANCE_MANAGE/);
    assert.match(entry("/overtime"), /permission: PERMISSIONS\.ATTENDANCE_VIEW/);
    assert.match(
      entry("/overtime/management"),
      /anyPermission: \[PERMISSIONS\.ATTENDANCE_APPROVE, PERMISSIONS\.ATTENDANCE_MANAGE\]/
    );
  });

  it("the report export route checks every required permission server-side", () => {
    const route = readFileSync(join(root, "app/api/reports/export/route.ts"), "utf8");
    assert.match(route, /required\.every\(\(code\) => granted\.has\(code\)\)/);
    assert.match(route, /contracts: \[\s*PERMISSIONS\.EMPLOYEES_EXPORT,\s*PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW,/);
    assert.match(route, /employees: \[PERMISSIONS\.REPORTS_VIEW\]/);
    assert.match(route, /leave: \[PERMISSIONS\.REPORTS_VIEW\]/);
    assert.match(route, /if \(!user\) return text\(401/);
  });
});

describe("compliance modules (0023): navigation matches page guards", () => {
  it("/compliance/mcu: employees.view AND personal.view (health data)", () => {
    const item = entry("/compliance/mcu");
    assert.match(item, /permission: PERMISSIONS\.EMPLOYEES_PERSONAL_VIEW/);
    assert.match(item, /anyPermission: \[PERMISSIONS\.EMPLOYEES_VIEW\]/);
    const guard = page("compliance/mcu");
    assert.match(guard, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
    assert.match(guard, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_PERSONAL_VIEW\)/);
    assert.match(guard, /isComplianceModuleReady\(\)/);
  });

  it("/compliance/trainings: employees.view AND employment.view", () => {
    const item = entry("/compliance/trainings");
    assert.match(item, /permission: PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW/);
    const guard = page("compliance/trainings");
    assert.match(guard, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW\)/);
    assert.match(guard, /isComplianceModuleReady\(\)/);
  });

  it("mutations re-check permission, module readiness and organization", () => {
    const actions = readFileSync(join(root, "features/compliance/records.actions.ts"), "utf8");
    assert.match(actions, /^"use server";/);
    assert.match(actions, /saveMcuAction[\s\S]*?authorize\(PERMISSIONS\.EMPLOYEES_PERSONAL_UPDATE\)/);
    assert.match(actions, /saveTrainingAction[\s\S]*?authorize\(PERMISSIONS\.EMPLOYEES_EMPLOYMENT_UPDATE\)/);
    assert.match(actions, /isComplianceModuleReady\(\)/);
    assert.match(actions, /employeeInOrganization\(data\.employeeId, ctx\.organizationId\)/);
    // Every update / delete is scoped by organization.
    const scoped = actions.match(/eq\(\w+\.organizationId, ctx\.organizationId\)/g) ?? [];
    assert.ok(scoped.length >= 10, `expected organization scoping on every write, found ${scoped.length}`);
  });

  it("exports need export + the data permission", () => {
    const route = readFileSync(join(root, "app/api/reports/export/route.ts"), "utf8");
    assert.match(route, /mcu: \[\s*PERMISSIONS\.EMPLOYEES_EXPORT,\s*PERMISSIONS\.EMPLOYEES_PERSONAL_VIEW,/);
    assert.match(route, /trainings: \[\s*PERMISSIONS\.EMPLOYEES_EXPORT,\s*PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW,/);
  });
});
