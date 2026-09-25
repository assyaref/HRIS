import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getUserAuthorization,
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { CreateEmployeeDialog } from "@/features/employees/employee-create-dialog";
import { ImportEmployeesDialog } from "@/features/employees/import/import-dialog";
import { ImportExcelDialog } from "@/features/employees/excel/import-dialog";
import { EmployeeExportButton } from "@/features/employees/export/export-button";
import { EmployeeExcelButtons } from "@/features/employees/export/excel-buttons";
import { EmployeeFilters } from "@/features/employees/employee-filters";
import { EmployeeTable } from "@/features/employees/employee-table";
import {
  listEmployeesByOrganization,
  listLinkableUsers,
} from "@/features/employees/queries";
import { employeeListSearchSchema } from "@/features/employees/schemas";
import { listActiveFieldDefinitions } from "@/features/employee-fields/queries";
import {
  CUSTOM_FILTER_PARAM_PREFIX,
  isFieldVisibleToRoles,
  isFieldWritableByRoles,
  parseCustomFieldFilters,
  toCustomFieldFilterSpec,
  type CustomFieldFilterSpec,
} from "@/features/employee-fields/filtering";

export const metadata: Metadata = {
  title: "Employees",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** Raw `cf:*` params from the URL, verbatim (parser validates them). */
function collectCustomFilterParams(
  params: Record<string, string | string[] | undefined>
): Record<string, string | string[] | undefined> {
  const collected: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key.startsWith(CUSTOM_FILTER_PARAM_PREFIX)) {
      collected[key] = value;
    }
  }
  return collected;
}

/** Carry the active filters (core + custom) into a new page URL. */
function filterQuery(
  filters: { q?: string; status?: string },
  customParams: Record<string, string | string[] | undefined>,
  page: number
): string {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  if (filters.status) search.set("status", filters.status);
  for (const [key, value] of Object.entries(customParams)) {
    if (typeof value === "string" && value) search.set(key, value);
    else if (Array.isArray(value) && value.length > 0) {
      for (const entry of value) {
        if (entry) search.append(key, entry);
      }
    }
  }
  if (page > 1) search.set("page", String(page));
  return search.toString();
}

/**
 * Organization-scoped employee directory.
 *
 * Search + status filter + ACTIVE custom-field filters + pagination all run
 * in the database against the authenticated user's organization. Custom-field
 * filters come from the field definitions (single source of truth): only
 * ACTIVE definitions visible to the caller's roles are offered, and their
 * values are matched by EXISTS subqueries on `employee_custom_field_values`
 * (never by loading employees into memory, never by hard-coded field names).
 * Page state is carried in URL query parameters so it can be shared and
 * bookmarked.
 */
export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const parsed = employeeListSearchSchema.safeParse({
    q: readParam(params.q),
    status: readParam(params.status),
    page: readParam(params.page),
  });
  const filters = parsed.success ? parsed.data : {};

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  if (!user.organizationId) {
    // Org-less users can never have employees.view in practice (RBAC is
    // org-scoped), but guard defensively.
    forbidden();
  }
  const organizationId = user.organizationId;

  const [
    canCreate,
    canEdit,
    canDelete,
    canImportExcel,
    canExportExcel,
    customDataView,
    customDataUpdate,
    authorization,
  ] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_CREATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DELETE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_IMPORT),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EXPORT),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE),
    getUserAuthorization(user.id),
  ]);

  // One definition fetch feeds both consumers (same ordered ACTIVE rows):
  //  - custom-field FILTERS: additionally narrowed to fields the caller's
  //    roles may see (visibilityConfig), so restricted fields are never
  //    offered or matched for this user.
  //  - the Create dialog: every ACTIVE field (single source of truth).
  // When neither consumer is active the query is skipped entirely.
  const roleCodes = authorization.roleCodes as readonly string[];
  const activeDefinitions =
    customDataView || (canCreate && customDataUpdate)
      ? await listActiveFieldDefinitions(organizationId)
      : [];
  const filterableDefinitions = customDataView
    ? activeDefinitions.filter((definition) =>
        isFieldVisibleToRoles(definition.visibilityConfig, roleCodes)
      )
    : [];
  const filterSpecs: CustomFieldFilterSpec[] =
    filterableDefinitions.map(toCustomFieldFilterSpec);

  const customFilters = parseCustomFieldFilters(
    collectCustomFilterParams(params),
    filterSpecs
  );
  const activeCustomParams = collectCustomFilterParams(params);

  const [result, linkableUsers] = await Promise.all([
    listEmployeesByOrganization(organizationId, filters, customFilters),
    canCreate ? listLinkableUsers(organizationId) : Promise.resolve([]),
  ]);
  const customFieldSpecs =
    canCreate && customDataView && customDataUpdate
      ? activeDefinitions
          .filter((definition) =>
            isFieldWritableByRoles(
              definition.visibilityConfig,
              definition.editableByConfig,
              roleCodes
            )
          )
          .map((definition) => ({
            fieldKey: definition.fieldKey,
            label: definition.label,
            description: definition.description,
            fieldType: definition.fieldType,
            isRequired: definition.isRequired,
            options: definition.options,
          }))
      : [];

  const { items, total, page, totalPages } = result;
  const hasActiveFilters = Boolean(
    filters.q || filters.status || customFilters.length > 0
  );
  const search = filters.q ?? "";
  const selectedCustomValues: Record<string, string> = {};
  for (const filter of customFilters) {
    selectedCustomValues[filter.spec.fieldKey] = normalizeFilterDisplay(
      filter
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Employees
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {total} {total === 1 ? "employee" : "employees"}
            {hasActiveFilters ? " match your filters" : ""} in your
            organization.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <EmployeeExportButton
            search={search}
            status={filters.status ?? ""}
            canExport={canExportExcel}
          />
          <EmployeeExcelButtons
            search={search}
            canExport={canExportExcel}
            canTemplate={canImportExcel}
          />
          {canCreate ? (
            <>
              <ImportEmployeesDialog />
              {canImportExcel ? <ImportExcelDialog /> : null}
              <CreateEmployeeDialog
                linkableUsers={linkableUsers}
                customFieldSpecs={customFieldSpecs}
              />
            </>
          ) : null}
        </div>
      </div>

      <EmployeeFilters
        search={search}
        status={filters.status ?? ""}
        customFieldSpecs={filterSpecs}
        selectedCustomValues={selectedCustomValues}
      />

      {items.length === 0 ? (
        <EmptyState
          title={hasActiveFilters ? "No matching employees" : "No employees yet"}
          description={
            hasActiveFilters
              ? "Try adjusting your search or filters."
              : "Create your first employee record to get started."
          }
        />
      ) : (
        <>
          <EmployeeTable
            employees={items}
            canEdit={canEdit}
            canDelete={canDelete}
          />

          {totalPages > 1 ? (
            <nav
              aria-label="Employee list pagination"
              className="flex items-center justify-between gap-3"
            >
              <p className="text-sm text-muted-foreground">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                {page > 1 ? (
                  <Link
                    href={`/employees?${filterQuery(
                      filters,
                      activeCustomParams,
                      page - 1
                    )}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Previous
                  </Link>
                ) : null}
                {page < totalPages ? (
                  <Link
                    href={`/employees?${filterQuery(
                      filters,
                      activeCustomParams,
                      page + 1
                    )}`}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                    })}
                  >
                    Next
                  </Link>
                ) : null}
              </div>
            </nav>
          ) : null}
        </>
      )}
    </div>
  );
}

function normalizeFilterDisplay(filter: {
  spec: CustomFieldFilterSpec;
  predicate: { kind: string; value: string | number | boolean };
}): string {
  if (filter.predicate.kind === "booleanEq") {
    return filter.predicate.value ? "true" : "false";
  }
  return String(filter.predicate.value);
}
