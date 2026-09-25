/**
 * Employee Excel import/export + Master Data security contract tests.
 *
 * Source-invariant assertions (mirroring employee-import-export-rbac.test.ts):
 * the Excel import actions must gate on employees.import (and employees.update
 * for update rows), resolve the organization from the session only, cap rows,
 * commit in ONE transaction and write the employee.imported audit event.
 * The Excel export/template routes must enforce employees.export /
 * employees.import and never accept authority identifiers from the query.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const read = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const excelImportAction = read(
  "features/employees/excel/import-action.ts"
);
const excelImport = read("features/employees/excel/import.ts");
const excelRoute = read("app/api/employees/export/route.ts");
const documentRoute = read(
  "app/api/employees/[employeeId]/documents/[documentId]/download/route.ts"
);
const masterDataActions = read(
  "features/employees/master-data/actions.ts"
);
const customValueAction =
  masterDataActions.split("export async function updateEmployeeCustomDataAction")[1]?.split(
    "export async function deleteEmployeeCustomDataAction"
  )[0] ?? "";
const fieldsActions = read("features/employee-fields/actions.ts");
const fieldsPage = read("app/(dashboard)/settings/employee-fields/page.tsx");
const detailPage = read("app/(dashboard)/employees/[employeeId]/page.tsx");
const createDialog = read(
  "features/employee-fields/dynamic-inputs.tsx"
);
const customFieldsSection = read(
  "features/employees/master-data/custom-fields-section.tsx"
);
const excelExport = read("features/employees/excel/export.ts");

describe("excel import action: RBAC + scoping", () => {
  it("requires employees.import on both steps", () => {
    assert.equal(
      excelImportAction.includes(
        "await requirePermission(user.id, PERMISSIONS.EMPLOYEES_IMPORT)"
      ),
      true
    );
  });

  it("requires employees.update when the file updates existing rows", () => {
    assert.equal(
      excelImportAction.includes(
        "await requirePermission(userId, PERMISSIONS.EMPLOYEES_UPDATE)"
      ),
      true
    );
  });

  it("requires employees.create when the file creates new rows", () => {
    assert.equal(
      excelImportAction.includes(
        "await requirePermission(userId, PERMISSIONS.EMPLOYEES_CREATE)"
      ),
      true
    );
  });

  it("re-authenticates and resolves the org from the session only", () => {
    assert.equal(excelImportAction.includes("requireUser()"), true);
    assert.equal(
      excelImportAction.includes('formData.get("organizationId")'),
      false
    );
  });

  it("checks per-section capabilities before touching section columns", () => {
    for (const capability of [
      "EMPLOYEES_PERSONAL_UPDATE",
      "EMPLOYEES_EMPLOYMENT_UPDATE",
      "EMPLOYEES_ADDRESS_UPDATE",
      "EMPLOYEES_INSURANCE_UPDATE",
      "EMPLOYEES_BANK_UPDATE",
      "EMPLOYEES_FAMILY_UPDATE",
      "EMPLOYEES_EDUCATION_UPDATE",
      "EMPLOYEE_CUSTOM_DATA_UPDATE",
    ]) {
      assert.equal(
        excelImportAction.includes(capability),
        true,
        `missing capability check: ${capability}`
      );
    }
  });

  it("re-validates and commits in one transaction with rollback", () => {
    assert.equal(excelImportAction.includes("db.transaction"), true);
    assert.match(excelImportAction, /No records were changed|rolled back/i);
  });

  it("writes the employee.imported audit event", () => {
    assert.equal(
      excelImportAction.includes('action: "employee.imported"'),
      true
    );
  });

  it("custom field validation is definition-driven", () => {
    assert.equal(
      excelImportAction.includes("listActiveFieldDefinitions"),
      true
    );
    assert.equal(excelImportAction.includes("parseCustomFieldValue"), true);
    assert.equal(excelImportAction.includes('"blood_type"'), false);
    assert.equal(excelImportAction.includes('"shirt_size"'), false);
  });

  it("custom import uses DB roles plus visibility and edit authorization", () => {
    assert.equal(excelImportAction.includes("getUserAuthorization"), true);
    assert.equal(excelImportAction.includes("isFieldWritableByRoles"), true);
    assert.equal(excelImportAction.includes("EMPLOYEE_CUSTOM_DATA_VIEW"), true);
    assert.equal(excelImportAction.includes("EMPLOYEE_CUSTOM_DATA_UPDATE"), true);
    assert.equal(excelImportAction.includes("fieldDefinitionId: definition.id"), true);
    assert.equal(excelImportAction.includes("fieldDefinitionId: spec.fieldDefinitionId"), true);
    assert.equal(
      excelImportAction.includes("unknown or unauthorized custom field"),
      true
    );
    assert.equal(excelImportAction.includes("inaccessibleRequiredField"), true);
    const employeeActions = read("features/employees/actions.ts");
    assert.equal(employeeActions.includes("inaccessibleRequiredField"), true);
  });

  it("rejects unauthorized sections instead of silently dropping them", () => {
    assert.equal(excelImportAction.includes("findUnauthorizedSections"), true);
    assert.match(excelImportAction, /not authorized to update/i);
    assert.equal(/if \(!permissions\.(address|insurance|bank|family|education)\) break;/.test(excelImportAction), false);
  });

  it("updates preserve blank values and cannot reactivate through import", () => {
    assert.equal(excelImportAction.includes("buildExcelUpdatePatch"), true);
    assert.equal(
      excelImportAction.includes("inactive employees cannot be reactivated through Excel import"),
      true
    );
    assert.equal(
      excelImportAction.includes("PERMISSIONS.EMPLOYEES_DELETE"),
      true
    );
  });

  it("bank, family, and education writes are idempotent within the transaction", () => {
    assert.equal(excelImportAction.includes("employeeBankAccounts.bankName"), true);
    assert.equal(excelImportAction.includes(".from(employeeDependents)"), true);
    assert.equal(excelImportAction.includes(".from(employeeEducations)"), true);
    assert.equal(excelImport.includes("deduplicateSecondaryRows"), true);
    assert.equal(excelImportAction.includes(".delete(employeeBankAccounts)"), false);
    assert.equal(excelImportAction.includes(".delete(employeeDependents)"), false);
    assert.equal(excelImportAction.includes(".delete(employeeEducations)"), false);
    assert.match(excelImportAction, /multiple bank accounts match/i);
    assert.match(excelImportAction, /multiple dependents match/i);
    assert.match(excelImportAction, /multiple education records match/i);
    assert.equal(excelImportAction.includes("db.transaction"), true);
  });
});

describe("excel export/template route: RBAC + scoping + audit", () => {
  it("rejects authority identifiers from the query", () => {
    assert.equal(excelRoute.includes("FORBIDDEN_QUERY_KEYS"), true);
    assert.equal(
      excelRoute.includes('["organizationId", "employeeId"]'),
      true
    );
  });

  it("requires employees.view and employees.export / import per format", () => {
    assert.equal(
      excelRoute.includes("hasPermission(user.id, PERMISSIONS.EMPLOYEES_VIEW)"),
      true
    );
    assert.equal(
      excelRoute.includes("requirePermission(userId, PERMISSIONS.EMPLOYEES_EXPORT)"),
      true
    );
    assert.equal(
      excelRoute.includes("requirePermission(userId, PERMISSIONS.EMPLOYEES_IMPORT)"),
      true
    );
  });

  it("gates every sheet on the matching view capability", () => {
    for (const code of [
      "EMPLOYEES_PERSONAL_VIEW",
      "EMPLOYEES_EMPLOYMENT_VIEW",
      "EMPLOYEES_ADDRESS_VIEW",
      "EMPLOYEES_INSURANCE_VIEW",
      "EMPLOYEES_BANK_VIEW",
      "EMPLOYEES_FAMILY_VIEW",
      "EMPLOYEES_EDUCATION_VIEW",
      "EMPLOYEES_DOCUMENT_VIEW",
      "EMPLOYEE_CUSTOM_DATA_VIEW",
    ]) {
      assert.equal(excelRoute.includes(code), true, `missing ${code}`);
    }
  });

  it("masks sensitive identifiers for viewers without steward rights", () => {
    assert.equal(excelRoute.includes("policy"), true);
    assert.equal(
      excelRoute.includes("maskSensitiveFields: true"),
      true
    );
  });

  it("writes the employee.exported audit event", () => {
    assert.equal(
      excelRoute.includes('action: "employee.exported"'),
      true
    );
  });

  it("requires employees.export for both CSV and Excel", () => {
    const exportChecks = excelRoute.match(/PERMISSIONS\.EMPLOYEES_EXPORT/g) ?? [];
    assert.ok(exportChecks.length >= 2);
    assert.equal(excelRoute.includes("text/csv"), true);
    assert.equal(excelRoute.includes("attachment"), true);
  });
});

describe("document download route: RBAC + org scoping + audit", () => {
  it("requires employees.document.view", () => {
    assert.equal(
      documentRoute.includes(
        "requirePermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW)"
      ),
      true
    );
  });

  it("scopes the lookup by organization AND employee AND document", () => {
    assert.equal(
      documentRoute.includes("eq(employeeDocuments.employeeId, employeeId)"),
      true
    );
    assert.equal(
      documentRoute.includes(
        "eq(employeeDocuments.organizationId, user.organizationId)"
      ),
      true
    );
  });

  it("audits the download", () => {
    assert.equal(
      documentRoute.includes('action: "employee.document.downloaded"'),
      true
    );
  });
});

describe("master data actions: per-section RBAC + org scoping", () => {
  it("enforces the section capability on every action", () => {
    for (const code of [
      "EMPLOYEES_PERSONAL_UPDATE",
      "EMPLOYEES_EMPLOYMENT_UPDATE",
      "EMPLOYEES_ADDRESS_UPDATE",
      "EMPLOYEES_INSURANCE_UPDATE",
      "EMPLOYEES_BANK_UPDATE",
      "EMPLOYEES_FAMILY_UPDATE",
      "EMPLOYEES_EDUCATION_UPDATE",
      "EMPLOYEES_DOCUMENT_UPLOAD",
      "EMPLOYEES_DOCUMENT_DELETE",
      "EMPLOYEE_CUSTOM_DATA_UPDATE",
      "EMPLOYEE_CUSTOM_DATA_DELETE",
    ]) {
      assert.equal(
        masterDataActions.includes(code),
        true,
        `missing ${code}`
      );
    }
  });

  it("primary bank switch and inserts use transactions", () => {
    assert.equal(masterDataActions.includes("db.transaction"), true);
  });

  it("custom values require view, update, visibility, and edit authorization", () => {
    assert.equal(
      customValueAction.includes("PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW"),
      true
    );
    assert.equal(
      customValueAction.includes("PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE"),
      true
    );
    assert.equal(customValueAction.includes("getUserAuthorization"), true);
    assert.equal(customValueAction.includes("isFieldWritableByRoles"), true);
    assert.equal(customValueAction.includes("visibilityConfig"), true);
    assert.equal(customValueAction.includes("editableByConfig"), true);
  });

  it("custom values resolve definitions server-side and scope every write", () => {
    assert.equal(customValueAction.includes("formData.get(\"fieldDefinitionId\")"), false);
    assert.equal(customValueAction.includes("fieldDefinitionId: definition.id"), true);
    assert.equal(
      customValueAction.includes("eq(employees.organizationId, organizationId)"),
      true
    );
    assert.equal(customValueAction.includes("organizationId,"), true);
    assert.equal(
      customValueAction.includes("employeeCustomFieldValues.organizationId"),
      true
    );
  });

  it("does not clear custom values omitted from a partial submission", () => {
    assert.equal(customValueAction.includes("__present"), true);
    assert.match(customValueAction, /continue;/);
    assert.equal(
      customFieldsSection.includes("specs.filter((spec) => spec.canEdit)"),
      true
    );
  });

  it("validates first, then updates employee and all custom values transactionally", () => {
    const validationIndex = customValueAction.indexOf("parseCustomFieldValue");
    const transactionIndex = customValueAction.indexOf("db.transaction");
    const firstWriteIndex = customValueAction.indexOf(
      ".insert(employeeCustomFieldValues)"
    );
    assert.ok(validationIndex >= 0);
    assert.ok(transactionIndex > validationIndex);
    assert.ok(firstWriteIndex > transactionIndex);
    assert.match(customValueAction, /tx\s*\.update\(employees\)/);
    assert.match(customValueAction, /tx\s*\.insert\(employeeCustomFieldValues\)/);
  });
});

describe("employment history integrity", () => {
  it("records profile, master-data, status-toggle, and Excel changes transactionally", () => {
    const employeeActions = read("features/employees/actions.ts");
    assert.equal(employeeActions.includes("Status changed through employee profile"), true);
    assert.equal(masterDataActions.includes("tx.insert(employeeEmploymentHistory)"), true);
    assert.equal(excelImportAction.includes("tx.insert(employeeEmploymentHistory)"), true);
    assert.equal(excelImportAction.includes("db.transaction"), true);
  });
});

describe("employee field management actions", () => {
  it("duplicate + reorder enforce EMPLOYEE_FIELDS capabilities", () => {
    assert.equal(fieldsActions.includes("EMPLOYEE_FIELDS_CREATE"), true);
    assert.equal(fieldsActions.includes("EMPLOYEE_FIELDS_UPDATE"), true);
    assert.equal(fieldsActions.includes("EMPLOYEE_FIELDS_DELETE"), true);
    assert.equal(
      fieldsActions.includes("duplicateEmployeeFieldAction"),
      true
    );
    assert.equal(
      fieldsActions.includes("reorderEmployeeFieldsAction"),
      true
    );
  });

  it("visibility + editable configs use organization DB roles", () => {
    assert.equal(fieldsActions.includes("visibilityRoles"), true);
    assert.equal(fieldsActions.includes("editableRoles"), true);
    assert.equal(fieldsActions.includes("roleCodesFromField"), true);
    assert.equal(fieldsActions.includes("listRolesByOrganization"), true);
    assert.equal(fieldsPage.includes("listRolesByOrganization"), true);
    assert.equal(fieldsActions.includes("ROLE_CODES"), false);
  });
});

describe("employee detail page", () => {
  it("renders tabbed sections, each gated on the matching view capability", () => {
    for (const code of [
      "EMPLOYEES_PERSONAL_VIEW",
      "EMPLOYEES_EMPLOYMENT_VIEW",
      "EMPLOYEES_ADDRESS_VIEW",
      "EMPLOYEES_INSURANCE_VIEW",
      "EMPLOYEES_BANK_VIEW",
      "EMPLOYEES_FAMILY_VIEW",
      "EMPLOYEES_EDUCATION_VIEW",
      "EMPLOYEES_DOCUMENT_VIEW",
      "EMPLOYEE_CUSTOM_DATA_VIEW",
    ]) {
      assert.equal(detailPage.includes(code), true, `missing ${code}`);
    }
    assert.equal(detailPage.includes("AttendanceTab"), true);
    assert.equal(detailPage.includes("LeaveTab"), true);
    assert.equal(detailPage.includes("PayrollTab"), true);
    assert.equal(detailPage.includes("CustomFieldsSection"), true);
  });

  it("never sends raw sensitive identifiers to viewers without steward rights", () => {
    assert.equal(detailPage.includes("reveal={insuranceUpdate}"), true);
    assert.equal(detailPage.includes("reveal={bankUpdate}"), true);
    assert.equal(detailPage.includes("reveal={personalUpdate}"), true);
  });

  it("create dialog custom fields are definition-driven", () => {
    assert.equal(createDialog.includes("DynamicCustomFieldInputs"), true);
    const createAction = read("features/employees/actions.ts");
    assert.equal(
      createAction.includes("listActiveFieldDefinitions"),
      true
    );
    assert.equal(createAction.includes("parseCustomFieldValue"), true);
    assert.equal(createAction.includes('"blood_type"'), false);
  });
});

describe("excel export masking policy", () => {
  it("supports per-column policy + omits hidden sheets", () => {
    assert.equal(excelExport.includes("ExportMaskPolicy"), true);
    assert.equal(excelExport.includes("hideDocuments"), true);
    assert.equal(excelExport.includes("hideCustomFields"), true);
  });

  it("uses stable custom-field keys and filters values by authorized definition ids", () => {
    assert.equal(excelRoute.includes("customFieldDefinitionIds"), true);
    assert.equal(excelRoute.includes("customFields,"), true);
    assert.equal(excelExport.includes("customFieldColumnHeader"), true);
    assert.equal(excelExport.includes("row.fieldKey"), true);
  });
});
