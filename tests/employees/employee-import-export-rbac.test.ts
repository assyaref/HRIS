/**
 * Employee Import/Export — RBAC + audit + security contract tests (node:test).
 *
 * Source-invariant assertions (mirroring `employee-delete-rbac.test.ts`):
 * the import action and export route must stay gated on
 * `employees.create`/`employees.view`, always resolve the organization from
 * the authenticated session, cap imports at 500 rows and write the documented
 * audit events. The audit action union is part of the contract too.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const importActionSource = readRepoFile(
  "features/employees/import/import-action.ts"
);
const exportRouteSource = readRepoFile("app/api/employees/export/route.ts");
const auditSource = readRepoFile("lib/auth/audit.ts");

describe("import action: RBAC + scoping", () => {
  it("requires employees.create", () => {
    assert.equal(
      importActionSource.includes(
        "await requirePermission(user.id, PERMISSIONS.EMPLOYEES_CREATE)"
      ),
      true
    );
  });

  it("re-authenticates the actor (requireUser)", () => {
    assert.equal(importActionSource.includes("requireUser()"), true);
    assert.equal(
      importActionSource.includes('from "@/lib/auth/rbac"'),
      true
    );
  });

  it("never accepts an organization id from the client", () => {
    assert.equal(importActionSource.includes("formData.get(\"organizationId\")"), false);
    assert.equal(importActionSource.includes('"organizationId"'), false);
  });

  it("caps imports at 500 rows", () => {
    assert.equal(importActionSource.includes("IMPORT_MAX_ROWS"), true);
    const importCoreSource = readRepoFile(
      "features/employees/import/import-core.ts"
    );
    assert.equal(importCoreSource.includes("IMPORT_MAX_ROWS = 500"), true);
  });

  it("guards the organization in the schema", () => {
    assert.equal(importActionSource.includes("organizationId"), true);
  });
});

describe("confirm import: validation + transaction + rollback", () => {
  it("re-validates the confirm payload (db.transaction rollback path)", () => {
    assert.equal(importActionSource.includes("db.transaction"), true);
    assert.equal(importActionSource.includes("JSON.parse"), true);
  });

  it("never writes partial imports on failure", () => {
    assert.match(
      importActionSource,
      /No records were changed|rolls the entire import/i
    );
  });

  it("writes the employee.imported audit event", () => {
    assert.equal(importActionSource.includes('action: "employee.imported"'), true);
  });
});

describe("export route: RBAC + scoping + audit", () => {
  it("requires employees.view and employees.export", () => {
    assert.equal(
      exportRouteSource.includes(
        "await hasPermission(user.id, PERMISSIONS.EMPLOYEES_VIEW)"
      ),
      true
    );
    assert.ok(
      (exportRouteSource.match(/PERMISSIONS\.EMPLOYEES_EXPORT/g) ?? []).length >= 2
    );
  });

  it("resolves the organization from the session only", () => {
    assert.equal(exportRouteSource.includes("getCurrentUser()"), true);
    assert.equal(exportRouteSource.includes("FORBIDDEN_QUERY_KEYS"), true);
  });

  it("writes the employee.exported audit event", () => {
    assert.equal(exportRouteSource.includes('action: "employee.exported"'), true);
  });

  it("streams a CSV attachment", () => {
    assert.equal(exportRouteSource.includes("attachment"), true);
    assert.equal(exportRouteSource.includes("text/csv"), true);
  });
});

describe("audit action contract", () => {
  it("declares employee.imported and employee.exported", () => {
    assert.equal(auditSource.includes('"employee.imported"'), true);
    assert.equal(auditSource.includes('"employee.exported"'), true);
  });
});