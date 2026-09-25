import { getCurrentUser } from "@/lib/auth/auth";
import { writeAuditLog } from "@/lib/auth/audit";
import { getUserAuthorization } from "@/lib/auth/rbac";
import {
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { buildEmployeesCsv } from "@/features/employees/export/export-csv";
import { listEmployeesFlatByOrganization } from "@/features/employees/queries";
import { employeeListSearchSchema } from "@/features/employees/schemas";
import {
  buildMainExportWorkbook,
  type ExportMaskPolicy,
} from "@/features/employees/excel/export";
import {
  loadEmployeeMasterExportData,
  visibleCustomFieldColumns,
} from "@/features/employees/excel/export-data";
import { buildTemplateWorkbook } from "@/features/employees/excel/template";
import { listActiveFieldDefinitions } from "@/features/employee-fields/queries";
import {
  CUSTOM_FILTER_PARAM_PREFIX,
  isFieldVisibleToRoles,
  isFieldWritableByRoles,
  parseCustomFieldFilters,
  toCustomFieldFilterSpec,
} from "@/features/employee-fields/filtering";

export const dynamic = "force-dynamic";

/**
 * Reject client attempts to provide tenant/authority identifiers. The
 * organization always comes from the authenticated session/database.
 */
const FORBIDDEN_QUERY_KEYS = ["organizationId", "employeeId"] as const;

/** Mirrors the employees page: empty/whitespace query params are dropped. */
function readParam(search: URLSearchParams, key: string): string | undefined {
  const value = search.get(key);
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function unauthorized(): Response {
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function forbiddenResponse(): Response {
  return new Response("Forbidden", {
    status: 403,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function notFound(): Response {
  return new Response("Not Found", {
    status: 404,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const SECURITY_HEADERS = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
} as const;

/**
 * Employee export endpoint.
 *
 * Formats:
 *   - `csv`     — the flat Phase-5 CSV (employees.view, org + page filters).
 *   - `excel`   — the multi-sheet Master Data workbook. Scope: all employees,
 *                 the page's active filters (`q`/`status`), a checkbox
 *                 selection (`ids`), or one employee (`employeeNo`).
 *   - `template`— the dynamic import template (employees.import).
 *
 * RBAC: a user never receives a sheet or column their role cannot view:
 * section sheets require the matching `employees.<section>.view`, custom
 * fields require `employee_custom_data.view`, documents require
 * `employees.document.view`. Sensitive identifiers (NIK/NPWP/BPJS/bank
 * account numbers) are masked unless the caller also holds the matching
 * section UPDATE capability (the "reveal" steward set).
 */
export async function GET(request: Request): Promise<Response> {
  const search = new URL(request.url).searchParams;
  for (const key of FORBIDDEN_QUERY_KEYS) {
    if (search.has(key)) {
      return new Response("Bad Request", {
        status: 400,
        headers: SECURITY_HEADERS,
      });
    }
  }

  const user = await getCurrentUser();
  if (!user) {
    return unauthorized();
  }
  if (!user.organizationId) {
    return notFound();
  }
  const organizationId = user.organizationId;

  if (!(await hasPermission(user.id, PERMISSIONS.EMPLOYEES_VIEW))) {
    return forbiddenResponse();
  }

  // The CSV always reflects the filters active on the employees page — the
  // same query-parameter names (`q`, `status`) and the same validation schema.
  // Unparseable filter values fall back to "no filter", matching the page.
  const parsed = employeeListSearchSchema.safeParse({
    q: readParam(search, "q"),
    status: readParam(search, "status"),
  });
  const filters = parsed.success ? parsed.data : {};

  const format = (readParam(search, "format") ?? "csv").toLowerCase();

  if (format === "csv") {
    await requirePermission(user.id, PERMISSIONS.EMPLOYEES_EXPORT);
    return handleCsvExport(user.id, organizationId, filters);
  }
  if (format === "excel" || format === "xlsx") {
    return handleExcelExport(user.id, organizationId, filters, search);
  }
  if (format === "template") {
    return handleTemplateExport(user.id, organizationId);
  }
  return new Response("Bad Request", { status: 400, headers: SECURITY_HEADERS });
}

async function handleCsvExport(
  userId: string,
  organizationId: string,
  filters: ReturnType<typeof employeeListSearchSchema.parse>
): Promise<Response> {
  const orgEmployees = await listEmployeesFlatByOrganization(
    organizationId,
    filters
  );

  const { csv, filename } = buildEmployeesCsv(
    orgEmployees.map((employee) => ({
      employeeNumber: employee.employeeNumber,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      email: employee.email,
      status: employee.employmentStatus,
      hireDate: employee.hireDate
        ? employee.hireDate.toISOString().slice(0, 10)
        : null,
    }))
  );

  // Best effort only: an audit failure must never fail the download.
  try {
    await writeAuditLog({
      organizationId,
      actorUserId: userId,
      action: "employee.exported",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        format: "csv",
        count: orgEmployees.length,
        filename,
      },
    });
  } catch (error) {
    console.error("[employees] export audit failed", error);
  }

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(Buffer.byteLength(csv, "utf8")),
      ...SECURITY_HEADERS,
    },
  });
}

async function handleExcelExport(
  userId: string,
  organizationId: string,
  filters: ReturnType<typeof employeeListSearchSchema.parse>,
  search: URLSearchParams
): Promise<Response> {
  await requirePermission(userId, PERMISSIONS.EMPLOYEES_EXPORT);

  // --- selection / individual / filtered / all ---------------------------
  const selected = (readParam(search, "ids") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 64)
    .slice(0, 1000);
  const employeeNo = readParam(search, "employeeNo");

  // Dynamic custom-field filters (cf:<fieldKey>) resolve against the same
  // definition source as the employee list page: ACTIVE, org-scoped, and
  // visible to this caller's roles only.
  const cfParams: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of search.entries()) {
    if (key.startsWith(CUSTOM_FILTER_PARAM_PREFIX)) cfParams[key] = value;
  }

  let scope: readonly string[] | null;
  let scopeLabel: "all" | "filtered" | "selected" | "individual";
  let customFilters: ReturnType<typeof parseCustomFieldFilters> = [];
  if (employeeNo) {
    scope = [employeeNo.slice(0, 64)];
    scopeLabel = "individual";
  } else if (selected.length > 0) {
    scope = selected;
    scopeLabel = "selected";
  } else {
    if (Object.keys(cfParams).length > 0) {
      const { roleCodes } = await getUserAuthorization(userId);
      const canViewCustomData = await hasPermission(
        userId,
        PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW
      );
      const definitions = canViewCustomData
        ? await listActiveFieldDefinitions(organizationId)
        : [];
      const specs = definitions
        .filter((definition) =>
          isFieldVisibleToRoles(definition.visibilityConfig, roleCodes)
        )
        .map(toCustomFieldFilterSpec);
      customFilters = parseCustomFieldFilters(cfParams, specs);
    }
    if (filters.q || filters.status || customFilters.length > 0) {
      // Export Filtered: reuse the exact same search path as the page.
      const matching = await listEmployeesFlatByOrganization(
        organizationId,
        { ...filters, page: undefined },
        customFilters
      );
      scope = matching.map((employee) => employee.id);
      scopeLabel = "filtered";
    } else {
      scope = null;
      scopeLabel = "all";
    }
  }
  if (scope !== null && scope.length === 0) {
    scope = ["-"];
  }

  // --- sheet/column RBAC ---------------------------------------------------
  const [
    personalView,
    employmentView,
    addressView,
    insuranceView,
    bankView,
    familyView,
    educationView,
    documentView,
    customDataView,
    personalUpdate,
    insuranceUpdate,
    bankUpdate,
  ] = await Promise.all([
    hasPermission(userId, PERMISSIONS.EMPLOYEES_PERSONAL_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_ADDRESS_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_INSURANCE_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_BANK_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_FAMILY_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_EDUCATION_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_INSURANCE_UPDATE),
    hasPermission(userId, PERMISSIONS.EMPLOYEES_BANK_UPDATE),
  ]);

  const { roleCodes } = await getUserAuthorization(userId);
  const definitions = customDataView
    ? await listActiveFieldDefinitions(organizationId)
    : [];
  const visibleDefinitions = definitions.filter((definition) =>
    isFieldVisibleToRoles(definition.visibilityConfig, roleCodes)
  );
  const customFields = visibleCustomFieldColumns(visibleDefinitions, roleCodes);
  const data = await loadEmployeeMasterExportData(organizationId, {
    employeeNumbers: scope,
    filters: scopeLabel === "all" ? filters : undefined,
    include: {
      personal: personalView,
      employment: employmentView,
      address: addressView,
      insurance: insuranceView,
      bank: bankView,
      family: familyView,
      education: educationView,
      documents: documentView,
      customFields: customDataView,
    },
    customFieldDefinitionIds: visibleDefinitions.map((definition) => definition.id),
  });

  // Sensitive identifiers reveal to the section "steward" roles (those that
  // can update the section); everyone else always receives masked values.
  const policy: ExportMaskPolicy = {
    nik: !(personalUpdate && personalView),
    phone: !personalUpdate,
    email: false,
    personalEmail: !personalUpdate,
    npwp: !insuranceUpdate,
    bpjs: !insuranceUpdate,
    bankAccount: !bankUpdate,
    familyNik: !personalUpdate,
    hideDocuments: !documentView,
    hideCustomFields: !customDataView,
  };

  const { buffer, filename } = await buildMainExportWorkbook(data, {
    maskSensitiveFields: true,
    policy,
    customFields,
    organizationName: undefined,
  });

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: userId,
      action: "employee.exported",
      entityType: "organization",
      entityId: organizationId,
      metadata: {
        format: "excel",
        scope: scopeLabel,
        count: data.employees.length,
        filename,
        masked: true,
      },
    });
  } catch (error) {
    console.error("[employees] excel export audit failed", error);
  }

  const bytes = Buffer.from(buffer as unknown as ArrayBuffer);
  return new Response(new Uint8Array(bytes) as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      ...SECURITY_HEADERS,
    },
  });
}

async function handleTemplateExport(
  userId: string,
  organizationId: string
): Promise<Response> {
  await requirePermission(userId, PERMISSIONS.EMPLOYEES_IMPORT);

  // Templates are definition-driven: ACTIVE fields in display order, each
  // option list rendered as a dropdown when the field is list-style. The
  // caller's role visibility still gates whether a field appears at all, so
  // an option/field the caller may not use is never handed to them.
  const [authorization, canViewCustomData, canUpdateCustomData] =
    await Promise.all([
      getUserAuthorization(userId),
      hasPermission(userId, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW),
      hasPermission(userId, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE),
    ]);
  const definitions =
    canViewCustomData && canUpdateCustomData
      ? (await listActiveFieldDefinitions(organizationId)).filter(
          (definition) =>
            isFieldWritableByRoles(
              definition.visibilityConfig,
              definition.editableByConfig,
              authorization.roleCodes
            )
        )
      : [];
  const { buffer, filename } = await buildTemplateWorkbook({
    customFields: definitions.map((definition) => ({
      fieldKey: definition.fieldKey,
      label: definition.label,
      fieldType: definition.fieldType,
      options: definition.options,
    })),
  });

  try {
    await writeAuditLog({
      organizationId,
      actorUserId: userId,
      action: "employee.exported",
      entityType: "organization",
      entityId: organizationId,
      metadata: { format: "template", filename },
    });
  } catch (error) {
    console.error("[employees] template export audit failed", error);
  }

  const bytes = Buffer.from(buffer as unknown as ArrayBuffer);
  return new Response(new Uint8Array(bytes) as BodyInit, {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      ...SECURITY_HEADERS,
    },
  });
}
