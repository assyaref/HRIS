import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";

import {
  EXPORT_SHEETS,
  sanitizeSheetName,
  resolveCustomTabSheetNames,
  EXCEL_SHEET_NAME_MAX_LENGTH,
} from "../../features/employees/excel/columns.ts";
import {
  planCustomTabSheets,
  customDataSheetNames,
  type ExcelCustomTabLike,
} from "../../features/employees/excel/custom-tab-sheets.ts";
import {
  buildMainExportWorkbook,
  type EmployeeMasterExportData,
  type ExportBuildOptions,
} from "../../features/employees/excel/export.ts";
import { buildTemplateWorkbook } from "../../features/employees/excel/template.ts";
import {
  analyzeExcelImport,
  planExcelImport,
  type CustomFieldImportSpec,
} from "../../features/employees/excel/import.ts";

const tab = (
  tabKey: string,
  name: string,
  displayOrder: number
): ExcelCustomTabLike & { id: string; displayOrder: number } => ({
  id: `id-${tabKey}`,
  tabKey,
  name,
  icon: null,
  status: "active",
  displayOrder,
});

const field = (
  fieldKey: string,
  label: string,
  tabKey: string | null = null,
  fieldType = "text",
  options: readonly string[] = []
) => ({
  fieldKey,
  label,
  fieldType,
  options,
  tabKey,
});

/** Minimal valid export payload: one employee, one row per core sheet. */
function sampleExportData(
  customValues: EmployeeMasterExportData["customValues"] = []
): EmployeeMasterExportData {
  return {
    employees: [
      {
        employeeNumber: "EMP-001",
        firstName: "Jane",
        lastName: "Doe",
        email: "jane@acme.test",
        phone: "081234567890",
        hireDate: "2023-01-15",
        status: "active",
        nik: "1234123412341234",
        birthDate: "1995-04-20",
        nickname: "Jane",
        birthPlace: "Jakarta",
        gender: "Female",
        religion: "Kristen",
        maritalStatus: "Single",
        nationality: "WNI",
        personalEmail: "jane.personal@gmail.test",
        division: "Operations",
        department: "Support",
        position: "Analyst",
        workLocation: "HQ",
        managerEmployeeNumber: "EMP-000",
        employmentType: "Permanent",
        contractStart: "2023-01-15",
        contractEnd: null,
        resignationDate: null,
        terminationDate: null,
        reasonForLeaving: null,
      },
    ],
    addresses: [],
    insurances: [],
    bankAccounts: [],
    family: [],
    education: [],
    customValues,
    documents: [],
  } as EmployeeMasterExportData;
}

async function sheetsOf(buffer: ArrayBuffer | Buffer): Promise<string[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook.worksheets.map((sheet) => sheet.name);
}

async function workbookOf(
  buffer: ArrayBuffer | Buffer
): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return wb;
}

// --- sheet name sanitization --------------------------------------------

test("sanitizeSheetName: replaces characters Excel rejects with a space", () => {
  assert.equal(sanitizeSheetName("Cer[t]ifi/ka*ti:on?"), "Cer t ifi ka ti on");
  assert.equal(sanitizeSheetName("Back\\slash"), "Back slash");
  // Result stays a valid Excel sheet name.
  assert.ok(!/[\\/*[\]:?]/.test(sanitizeSheetName("a[b]c/d\\e*f:g?h")));
});

test("sanitizeSheetName: collapses whitespace and trims", () => {
  assert.equal(sanitizeSheetName("  My   Tab  "), "My Tab");
  assert.equal(sanitizeSheetName("Tab\nWith\nNewlines"), "Tab With Newlines");
});

test("sanitizeSheetName: caps at the Excel 31-character limit", () => {
  const result = sanitizeSheetName("A".repeat(80));
  assert.equal(result.length, EXCEL_SHEET_NAME_MAX_LENGTH);
  assert.ok(result.length <= 31);
});

test("sanitizeSheetName: returns empty for unusable input so callers can fall back", () => {
  assert.equal(sanitizeSheetName(""), "");
  assert.equal(sanitizeSheetName("   "), "");
  assert.equal(sanitizeSheetName("///"), "");
  assert.equal(sanitizeSheetName("[]*?:"), "");
});

// --- sheet collision -----------------------------------------------------

test("resolveCustomTabSheetNames: never collides with a core sheet", () => {
  const resolved = resolveCustomTabSheetNames(
    [{ tabKey: "personal", name: "Employees" }],
    EXPORT_SHEETS
  );
  assert.equal(resolved[0]?.sheetName, "Employees (2)");
  assert.notEqual(resolved[0]?.sheetName.toLowerCase(), "employees");
});

test("resolveCustomTabSheetNames: disambiguates two tabs that sanitize alike", () => {
  const resolved = resolveCustomTabSheetNames(
    [
      { tabKey: "cert_a", name: "Cert: A" },
      { tabKey: "cert_b", name: "Cert? A" },
    ],
    EXPORT_SHEETS
  );
  assert.equal(resolved[0]?.sheetName, "Cert A");
  assert.equal(resolved[1]?.sheetName, "Cert A (2)");
});

test("resolveCustomTabSheetNames: collision suffix still respects the 31-char cap", () => {
  const long = "T".repeat(40);
  const resolved = resolveCustomTabSheetNames(
    [
      { tabKey: "one", name: long },
      { tabKey: "two", name: long },
    ],
    EXPORT_SHEETS
  );
  for (const entry of resolved) {
    assert.ok(
      entry.sheetName.length <= 31,
      `${entry.sheetName} is ${entry.sheetName.length} chars`
    );
  }
  assert.notEqual(resolved[0]?.sheetName, resolved[1]?.sheetName);
});

test("resolveCustomTabSheetNames: is deterministic across runs", () => {
  const tabs = [
    { tabKey: "a", name: "Same" },
    { tabKey: "b", name: "Same" },
  ];
  assert.deepEqual(
    resolveCustomTabSheetNames(tabs, EXPORT_SHEETS),
    resolveCustomTabSheetNames(tabs, EXPORT_SHEETS)
  );
});

test("resolveCustomTabSheetNames: falls back to the tab key when the name is unusable", () => {
  const resolved = resolveCustomTabSheetNames(
    [{ tabKey: "training", name: "***" }],
    EXPORT_SHEETS
  );
  assert.equal(resolved[0]?.sheetName, "Tab training");
});

// --- plan ----------------------------------------------------------------

test("plan: each tab gets its own sheet with only its own fields", () => {
  const plan = planCustomTabSheets(
    [tab("cert", "Certification", 0), tab("train", "Training", 1)],
    [
      field("cert_number", "Certificate Number", "cert"),
      field("cert_date", "Expiry Date", "cert"),
      field("course_name", "Course", "train"),
      field("shirt_size", "Shirt Size", null),
    ]
  );
  assert.deepEqual(
    plan.sheets.map((sheet) => [
      sheet.tabKey,
      sheet.fields.map((f) => f.fieldKey),
    ]),
    [
      ["cert", ["cert_number", "cert_date"]],
      ["train", ["course_name"]],
    ]
  );
  assert.deepEqual(plan.leftover.map((f) => f.fieldKey), ["shirt_size"]);
});

test("plan: a field whose tab is not in the plan falls back, never disappears", () => {
  const plan = planCustomTabSheets([tab("cert", "Certification", 0)], [
    field("secret", "Salary History", "salary_history"),
  ]);
  assert.deepEqual(plan.leftover.map((f) => f.fieldKey), ["secret"]);
});

test("plan: every field lands in exactly one sheet (no duplication, no loss)", () => {
  const fields = [
    field("a", "A", "cert"),
    field("b", "B", "cert"),
    field("c", "C", "train"),
    field("d", "D", null),
    field("e", "E", "unknown_tab"),
  ];
  const plan = planCustomTabSheets(
    [tab("cert", "Certification", 0), tab("train", "Training", 1)],
    fields
  );
  const seen = [
    ...plan.sheets.flatMap((sheet) => sheet.fields.map((f) => f.fieldKey)),
    ...plan.leftover.map((f) => f.fieldKey),
  ];
  assert.deepEqual(seen.sort(), ["a", "b", "c", "d", "e"]);
  assert.equal(new Set(seen).size, seen.length);
});

test("plan: sheet names never collide with core sheets or each other", () => {
  const plan = planCustomTabSheets(
    [
      tab("a", "Employees", 0),
      tab("b", "Employees", 1),
      tab("c", "Family", 2),
    ],
    [field("x", "X", "a"), field("y", "Y", "b"), field("z", "Z", "c")]
  );
  const names = plan.sheets.map((sheet) => sheet.sheetName);
  assert.equal(new Set(names.map((n) => n.toLowerCase())).size, names.length);
  for (const name of names) {
    assert.ok(
      !EXPORT_SHEETS.some((core) => core.toLowerCase() === name.toLowerCase())
    );
  }
});

test("plan: no tabs means everything stays on the built-in sheet", () => {
  const plan = planCustomTabSheets([], [field("a", "A"), field("b", "B")]);
  assert.equal(plan.sheets.length, 0);
  assert.deepEqual(plan.leftover.map((f) => f.fieldKey), ["a", "b"]);
});

test("customDataSheetNames: always includes the built-in sheet", () => {
  const plan = planCustomTabSheets([tab("cert", "Certification", 0)], []);
  const names = customDataSheetNames(plan);
  assert.ok(names.includes("Custom Fields"));
  assert.ok(names.includes("Certification"));
});

// --- export workbook -----------------------------------------------------

test("export: one sheet per visible tab plus the built-in sheet", async () => {
  const tabs = [tab("cert", "Certification", 0), tab("train", "Training", 1)];
  const customFields = [
    field("cert_number", "Certificate Number", "cert"),
    field("course_name", "Course", "train"),
    field("shirt_size", "Shirt Size", null),
  ];
  const { buffer } = await buildMainExportWorkbook(
    sampleExportData([
      {
        employeeNumber: "EMP-001",
        fieldKey: "cert_number",
        label: "Certificate Number",
        value: "CERT-9",
      },
      { employeeNumber: "EMP-001", fieldKey: "course_name", label: "Course", value: "Safety" },
      { employeeNumber: "EMP-001", fieldKey: "shirt_size", label: "Shirt Size", value: "M" },
    ]),
    {
      maskSensitiveFields: false,
      customFields,
      customTabPlan: planCustomTabSheets(tabs, customFields),
    } as ExportBuildOptions
  );
  const names = await sheetsOf(buffer);
  assert.deepEqual(names, [
    ...EXPORT_SHEETS.filter((n) => n !== "Custom Fields"),
    "Certification",
    "Training",
    "Custom Fields",
  ]);

  const workbook = await workbookOf(buffer);
  const cert = workbook.getWorksheet("Certification")!;
  assert.equal(cert.getRow(1).getCell(2).text, "Certificate Number [cert_number]");
  assert.equal(cert.getRow(2).getCell(2).text, "CERT-9");
  assert.equal(
    workbook.getWorksheet("Training")!.getRow(2).getCell(2).text,
    "Safety"
  );
  assert.equal(
    workbook.getWorksheet("Custom Fields")!.getRow(2).getCell(2).text,
    "M"
  );
});

test("export: a hidden tab's field is written to the built-in sheet, not a tab sheet", async () => {
  // The route only passes VISIBLE tabs, so a field parked on a hidden tab
  // carries a null tabKey and must land on Custom Fields — its tab name and
  // structure never reach the workbook.
  const customFields = [field("salary", "Salary", null)];
  const { buffer } = await buildMainExportWorkbook(
    sampleExportData([
      { employeeNumber: "EMP-001", fieldKey: "salary", label: "Salary", value: "10" },
    ]),
    {
      maskSensitiveFields: false,
      customFields,
      customTabPlan: planCustomTabSheets(
        [tab("cert", "Certification", 0)],
        customFields
      ),
    } as ExportBuildOptions
  );
  const names = await sheetsOf(buffer);
  assert.ok(!names.some((name) => /salary/i.test(name)));
  const workbook = await workbookOf(buffer);
  assert.equal(
    workbook.getWorksheet("Custom Fields")!.getRow(2).getCell(2).text,
    "10"
  );
});

test("export: without a plan the workbook keeps its historical single sheet", async () => {
  const { buffer } = await buildMainExportWorkbook(sampleExportData(), {
    maskSensitiveFields: false,
    customFieldLabels: ["Shirt Size"],
  } as ExportBuildOptions);
  assert.deepEqual(await sheetsOf(buffer), [...EXPORT_SHEETS]);
});

test("export: an empty tab produces no empty sheet, but Custom Fields is always present", async () => {
  const tabs = [tab("cert", "Certification", 0), tab("empty", "Empty Tab", 1)];
  const customFields = [field("cert_number", "Certificate Number", "cert")];
  const { buffer } = await buildMainExportWorkbook(sampleExportData(), {
    maskSensitiveFields: false,
    customFields,
    customTabPlan: planCustomTabSheets(tabs, customFields),
  } as ExportBuildOptions);
  const names = await sheetsOf(buffer);
  assert.ok(!names.includes("Empty Tab"));
  assert.ok(names.includes("Custom Fields"));
});

// --- template workbook ---------------------------------------------------

test("template: mirrors the export layout, one sheet per tab", async () => {
  const tabs = [tab("cert", "Certification", 0)];
  const specs = [
    {
      label: "Certificate Number",
      fieldType: "text",
      options: [],
      fieldKey: "cert_number",
      tabKey: "cert",
    },
    {
      label: "Shirt Size",
      fieldType: "text",
      options: [],
      fieldKey: "shirt_size",
      tabKey: null,
    },
  ];
  const { buffer } = await buildTemplateWorkbook({
    customFields: specs,
    customTabPlan: planCustomTabSheets(tabs, specs),
  });
  const workbook = await workbookOf(buffer);
  assert.ok(workbook.getWorksheet("Certification"));
  assert.equal(
    workbook.getWorksheet("Certification")!.getRow(1).getCell(2).text,
    "Certificate Number [cert_number]"
  );
  assert.equal(
    workbook.getWorksheet("Custom Fields")!.getRow(1).getCell(2).text,
    "Shirt Size [shirt_size]"
  );
});

test("template: a long, illegal tab name still yields a valid worksheet", async () => {
  const tabs = [tab("cert", `${"X".repeat(40)}:bad*name`, 0)];
  const specs = [
    { label: "A", fieldType: "text", options: [], fieldKey: "a", tabKey: "cert" },
  ];
  const { buffer } = await buildTemplateWorkbook({
    customFields: specs,
    customTabPlan: planCustomTabSheets(tabs, specs),
  });
  const names = await sheetsOf(buffer);
  const customSheet = names.find((name) => name.startsWith("X"));
  assert.ok(customSheet);
  assert.ok((customSheet as string).length <= 31);
  assert.ok(!/[\\/*[\]:?]/.test(customSheet as string));
});

test("template: list-style dropdowns still work across multiple tab sheets", async () => {
  const tabs = [tab("cert", "Certification", 0), tab("train", "Training", 1)];
  const specs = [
    {
      label: "Kind",
      fieldType: "select",
      options: ["A", "B"],
      fieldKey: "kind",
      tabKey: "cert",
    },
    {
      label: "Level",
      fieldType: "select",
      options: ["X", "Y"],
      fieldKey: "level",
      tabKey: "train",
    },
  ];
  const { buffer } = await buildTemplateWorkbook({
    customFields: specs,
    customTabPlan: planCustomTabSheets(tabs, specs),
  });
  const workbook = await workbookOf(buffer);
  const validation = (sheetName: string, cell: string) => {
    const sheet = workbook.getWorksheet(sheetName)! as unknown as {
      dataValidations: { model: Record<string, { formulae: string[] }> };
    };
    return sheet.dataValidations.model[cell]?.formulae?.[0] ?? "";
  };
  const cert = validation("Certification", "B2");
  const train = validation("Training", "B2");
  assert.match(cert, /_Lists/);
  assert.match(train, /_Lists/);
  // Each field owns a distinct `_Lists` column, so neither list is clobbered.
  assert.notEqual(cert, train);
});

// --- import round-trip ---------------------------------------------------

const importSpecs: CustomFieldImportSpec[] = [
  {
    fieldDefinitionId: "d1",
    label: "Certificate Number",
    fieldKey: "cert_number",
    fieldType: "text",
    options: [],
    isRequired: false,
  },
  {
    fieldDefinitionId: "d2",
    label: "Course",
    fieldKey: "course_name",
    fieldType: "text",
    options: [],
    isRequired: false,
  },
  {
    fieldDefinitionId: "d3",
    label: "Shirt Size",
    fieldKey: "shirt_size",
    fieldType: "text",
    options: [],
    isRequired: false,
  },
];

test("import: reads values back from a per-tab export round-trip", async () => {
  const tabs = [tab("cert", "Certification", 0), tab("train", "Training", 1)];
  const customFields = [
    field("cert_number", "Certificate Number", "cert"),
    field("course_name", "Course", "train"),
    field("shirt_size", "Shirt Size", null),
  ];
  const { buffer } = await buildMainExportWorkbook(
    sampleExportData([
      {
        employeeNumber: "EMP-001",
        fieldKey: "cert_number",
        label: "Certificate Number",
        value: "CERT-9",
      },
      { employeeNumber: "EMP-001", fieldKey: "course_name", label: "Course", value: "Safety" },
      { employeeNumber: "EMP-001", fieldKey: "shirt_size", label: "Shirt Size", value: "M" },
    ]),
    {
      maskSensitiveFields: false,
      customFields,
      customTabPlan: planCustomTabSheets(tabs, customFields),
    } as ExportBuildOptions
  );

  const plan = planCustomTabSheets(tabs, customFields);
  const analysis = await analyzeExcelImport(
    buffer,
    importSpecs,
    customDataSheetNames(plan)
  );
  assert.ok(
    !analysis.secondary.some((row) => row.error),
    JSON.stringify(analysis.secondary)
  );
  assert.equal(analysis.secondary.length, 3);
  assert.ok(analysis.secondary.every((row) => row.isCustomData));

  const planned = planExcelImport(analysis, new Set(["EMP-001"]));
  const row = planned.rows[0];
  assert.equal(row?.operation, "update");
  assert.deepEqual(row?.customValues, {
    cert_number: "CERT-9",
    course_name: "Safety",
    shirt_size: "M",
  });
});

test("import: a workbook whose tab sheet the caller cannot see is not read", async () => {
  const tabs = [tab("cert", "Certification", 0), tab("salary", "Compensation", 1)];
  const customFields = [
    field("cert_number", "Certificate Number", "cert"),
    field("salary", "Salary", "salary"),
  ];
  const { buffer } = await buildMainExportWorkbook(
    sampleExportData([
      {
        employeeNumber: "EMP-001",
        fieldKey: "cert_number",
        label: "Certificate Number",
        value: "CERT-9",
      },
      { employeeNumber: "EMP-001", fieldKey: "salary", label: "Salary", value: "999" },
    ]),
    {
      maskSensitiveFields: false,
      customFields,
      customTabPlan: planCustomTabSheets(tabs, customFields),
    } as ExportBuildOptions
  );

  // The caller can only see Certification, so only that sheet is opened.
  const visiblePlan = planCustomTabSheets(
    [tab("cert", "Certification", 0)],
    [field("cert_number", "Certificate Number", "cert")]
  );
  const specs: CustomFieldImportSpec[] = [
    importSpecs[0] as CustomFieldImportSpec,
    {
      fieldDefinitionId: "d9",
      label: "Salary",
      fieldKey: "salary",
      fieldType: "text",
      options: [],
      isRequired: false,
    },
  ];
  const analysis = await analyzeExcelImport(
    buffer,
    specs,
    customDataSheetNames(visiblePlan)
  );
  const planned = planExcelImport(analysis, new Set(["EMP-001"]));
  assert.deepEqual(planned.rows[0]?.customValues, { cert_number: "CERT-9" });
});

test("import: a legacy single-sheet workbook still imports unchanged", async () => {
  const { buffer } = await buildMainExportWorkbook(
    sampleExportData([
      {
        employeeNumber: "EMP-001",
        fieldKey: "cert_number",
        label: "Certificate Number",
        value: "CERT-9",
      },
    ]),
    {
      maskSensitiveFields: false,
      customFields: [
        field("cert_number", "Certificate Number", "cert"),
        field("shirt_size", "Shirt Size", null),
      ],
      customTabPlan: undefined,
    } as ExportBuildOptions
  );
  const analysis = await analyzeExcelImport(buffer, importSpecs);
  assert.ok(!analysis.secondary.some((row) => row.error));
  const planned = planExcelImport(analysis, new Set(["EMP-001"]));
  assert.equal(planned.rows[0]?.customValues.cert_number, "CERT-9");
});

test("import: an unauthorized field column on a visible tab sheet is rejected", async () => {
  const tabs = [tab("cert", "Certification", 0)];
  const customFields = [field("salary", "Salary", "cert")];
  const { buffer } = await buildMainExportWorkbook(
    sampleExportData([
      { employeeNumber: "EMP-001", fieldKey: "salary", label: "Salary", value: "999" },
    ]),
    {
      maskSensitiveFields: false,
      customFields,
      customTabPlan: planCustomTabSheets(tabs, customFields),
    } as ExportBuildOptions
  );
  // `salary` is not in the caller's spec list (not writable), so the header is
  // unknown and the row must error rather than silently drop data.
  const analysis = await analyzeExcelImport(
    buffer,
    importSpecs,
    customDataSheetNames(planCustomTabSheets(tabs, customFields))
  );
  const row = analysis.secondary.find((entry) => entry.sheet === "Certification");
  assert.ok(row?.error, "the unauthorized column must be reported, not dropped");
  assert.match(row.error, /unknown or unauthorized/);
  // The value must NOT reach the planned row's custom values.
  const planned = planExcelImport(analysis, new Set(["EMP-001"]));
  assert.deepEqual(planned.rows[0]?.customValues, {});
});

test("import: a field reassigned to another existing tab still imports from an older workbook", async () => {
  // The workbook only carries `Label [fieldKey]`; the tab lives in the
  // definition's `section`. So moving a field between two EXISTING visible tabs
  // cannot invalidate a file generated before the move.
  const before = await buildMainExportWorkbook(
    sampleExportData([
      {
        employeeNumber: "EMP-001",
        fieldKey: "cert_number",
        label: "Certificate Number",
        value: "CERT-9",
      },
    ]),
    {
      maskSensitiveFields: false,
      customFields: [field("cert_number", "Certificate Number", "cert")],
      customTabPlan: planCustomTabSheets(
        [tab("cert", "Certification", 0)],
        [field("cert_number", "Certificate Number", "cert")]
      ),
    } as ExportBuildOptions
  );

  // The field now belongs to Training, but both worksheets are still planned.
  const afterTabs = [tab("cert", "Certification", 0), tab("train", "Training", 1)];
  const afterFields = [field("cert_number", "Certificate Number", "train")];
  const analysis = await analyzeExcelImport(
    before.buffer,
    importSpecs,
    customDataSheetNames(planCustomTabSheets(afterTabs, afterFields))
  );
  assert.ok(!analysis.secondary.some((row) => row.error));
  const planned = planExcelImport(analysis, new Set(["EMP-001"]));
  assert.equal(planned.rows[0]?.customValues.cert_number, "CERT-9");
});

test("import: a stale sheet from a renamed tab is not read", async () => {
  // A tab rename changes a worksheet's identity, so the old name is no longer
  // planned. Reading it would also expose the tab name, so the analyzer ignores
  // it; the user re-downloads a fresh template.
  const stale = await buildMainExportWorkbook(
    sampleExportData([
      {
        employeeNumber: "EMP-001",
        fieldKey: "cert_number",
        label: "Certificate Number",
        value: "CERT-9",
      },
    ]),
    {
      maskSensitiveFields: false,
      customFields: [field("cert_number", "Certificate Number", "cert")],
      customTabPlan: planCustomTabSheets(
        [tab("cert", "Certification", 0)],
        [field("cert_number", "Certificate Number", "cert")]
      ),
    } as ExportBuildOptions
  );
  const renamedTabs = [tab("cert", "Accreditations", 0)];
  const renamedFields = [field("cert_number", "Certificate Number", "cert")];
  const analysis = await analyzeExcelImport(
    stale.buffer,
    importSpecs,
    customDataSheetNames(planCustomTabSheets(renamedTabs, renamedFields))
  );
  assert.deepEqual(planExcelImport(analysis, new Set(["EMP-001"])).rows[0]?.customValues, {});
});

test("import: a newly created tab needs no code change to appear in the workbook", async () => {
  // The plan is built from the org's tab data at request time, so adding a tab
  // is a data change: the next export/template/import picks it up.
  const first = planCustomTabSheets([tab("cert", "Certification", 0)], []);
  assert.deepEqual(customDataSheetNames(first), ["Custom Fields", "Certification"]);
  const second = planCustomTabSheets(
    [tab("cert", "Certification", 0), tab("train", "Training", 1)],
    []
  );
  assert.deepEqual(customDataSheetNames(second), [
    "Custom Fields",
    "Certification",
    "Training",
  ]);
});

test("export: an inactive tab is not in the plan, so its fields fall back", () => {
  // `listActiveCustomTabs` + `selectVisibleCustomTabs` drop inactive tabs
  // before the plan is built; the planner then has no sheet for them.
  const plan = planCustomTabSheets(
    [tab("cert", "Certification", 0)],
    [field("retired", "Old Course", "retired")]
  );
  assert.ok(!plan.sheets.some((sheet) => sheet.sheetName === "Retired"));
  assert.deepEqual(plan.leftover.map((f) => f.fieldKey), ["retired"]);
});

// --- source invariants: RBAC + org scoping wiring -----------------------

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

const exportRouteSource = readRepoFile("app/api/employees/export/route.ts");
const importActionSource = readRepoFile(
  "features/employees/excel/import-action.ts"
);

test("wiring: export resolves tabs from the session org and filters by role", () => {
  assert.match(exportRouteSource, /listActiveCustomTabs\(organizationId\)/);
  assert.match(exportRouteSource, /selectVisibleCustomTabs\(/);
  // The client must never be able to name a tab or an organization.
  assert.equal(exportRouteSource.includes('formData.get("organizationId")'), false);
});

test("wiring: template export applies the same visible-tab filter", () => {
  assert.match(exportRouteSource, /planCustomTabSheets\(visibleTabs, templateFields\)/);
});

test("wiring: import only opens the visible tab sheets", () => {
  // Tabs are resolved server-side for the TARGET organization of the import
  // (validated settings org; non-superadmins can only target their own), then
  // filtered by role. The client can never name a tab or an organization.
  assert.match(importActionSource, /listActiveCustomTabs\(organizationId\)/);
  assert.match(importActionSource, /customDataSheetNames\(tabPlan\)/);
  assert.match(importActionSource, /analyzeExcelImport\(\s*buffer,\s*customSpecs,\s*customDataSheetNames\s*\)/);
  assert.match(
    importActionSource,
    /analyzeExcelImport\(\s*buffer,\s*context\.customSpecs,\s*context\.customDataSheetNames\s*\)/
  );
});

test("wiring: import permission checks treat every custom-data sheet as custom data", () => {
  assert.equal(importActionSource.includes('row.sheet === "Custom Fields"'), false);
  assert.match(importActionSource, /secondary\.some\(\(row\) => row\.isCustomData\)/);
});
