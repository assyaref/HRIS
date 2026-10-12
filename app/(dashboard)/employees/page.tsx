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
  getOrganizationName,
} from "@/features/employees/queries";
import {
  employeeListSearchSchema,
  UUID_PATTERN,
} from "@/features/employees/schemas";
import { canPermanentlyDeleteEmployees } from "@/features/employees/permanent-delete-policy";
import { listActiveFieldDefinitions } from "@/features/employee-fields/queries";
import {
  CUSTOM_FILTER_PARAM_PREFIX,
  isFieldVisibleToRoles,
  isFieldWritableByRoles,
  parseCustomFieldFilters,
  toCustomFieldFilterSpec,
  type CustomFieldFilterSpec,
} from "@/features/employee-fields/filtering";
import {
  listAllOrganizationsForSuperAdmin,
  listRoleOptionsByOrganization,
  listRoleOptionsForSuperAdmin,
} from "@/features/rbac/queries";
import { listActiveWorkLocationOptionsForSuperAdmin } from "@/features/work-locations/queries";
import { listWorkLocationOptions } from "@/features/work-locations/queries";
import { listActiveProjectOptionsForSuperAdmin } from "@/features/projects/queries";
import { listProjectOptionsByOrganization } from "@/features/projects/queries";

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
  page: number,
  org?: string
): string {
  const search = new URLSearchParams();
  if (filters.q) search.set("q", filters.q);
  if (filters.status) search.set("status", filters.status);
  if (org) search.set("org", org);
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
  const authorization = await getUserAuthorization(user.id);

  /**
   * Explicit, server-validated organization selection.
   *
   * The `org` query parameter is honored ONLY for the cross-organization
   * (SUPERADMIN) role and only after the id is confirmed to be a real
   * organization. For every other caller the parameter is ignored outright,
   * so tenant isolation cannot be bypassed by editing the URL. The default
   * remains the authenticated user's own organization.
   */
  const requestedOrganizationId = readParam(params.org);
  let viewedOrganizationId: string | null = null;
  let viewedOrganizationName: string | null = null;
  if (
    authorization.isSuperAdmin &&
    requestedOrganizationId &&
    UUID_PATTERN.test(requestedOrganizationId) &&
    requestedOrganizationId !== user.organizationId
  ) {
    const requestedName = await getOrganizationName(requestedOrganizationId);
    if (requestedName) {
      viewedOrganizationId = requestedOrganizationId;
      viewedOrganizationName = requestedName;
    }
  }
  const organizationId = viewedOrganizationId ?? user.organizationId;
  const viewingOtherOrganization = viewedOrganizationId !== null;

  const [
    canCreate,
    canEdit,
    canDelete,
    canImportExcel,
    canExportExcel,
    customDataView,
    customDataUpdate,
  ] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_CREATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DELETE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_IMPORT),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EXPORT),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE),
  ]);

  // Permanent deletion is a separate, higher-privilege capability: the
  // `employees.permanent_delete` code AND the system-level SUPERADMIN role. Both
  // are evaluated server-side from the DB-backed authorization of the session,
  // and `permanentlyDeleteEmployeeAction` re-checks them — this only decides
  // whether the row action is offered.
  const canPermanentDelete = canPermanentlyDeleteEmployees(authorization);

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

  const [result, linkableUsers, importData] = await Promise.all([
    listEmployeesByOrganization(organizationId, filters, customFilters),
    canCreate ? listLinkableUsers(organizationId) : Promise.resolve([]),
    (async () => {
      if (!canImportExcel) return null;
      const isSuperAdmin = authorization.isSuperAdmin;

      // Fetch organizations (for SUPERADMIN: all active orgs; for others: just their own)
      const organizations = isSuperAdmin
        ? await listAllOrganizationsForSuperAdmin()
        : [{ id: organizationId, code: "", name: "" }];

      // Get organization names for non-superadmin
      let orgList = organizations;
      if (!authorization.isSuperAdmin) {
        const orgName = await getOrganizationName(organizationId);
        orgList = [{ id: organizationId, code: "", name: orgName ?? "" }];
      }

      // The wizard is one in-place dialog where a SUPERADMIN can switch the
      // target organization, so it needs the option lists for EVERY active
      // tenant (filtered client-side by the selected organization). A tenant
      // user only ever receives their own organization's options. Either way
      // `validateImportSettings` re-checks organization/project/work-location/
      // role membership server-side before anything is written.
      const [projects, workLocations, roles] = isSuperAdmin
        ? await Promise.all([
            listActiveProjectOptionsForSuperAdmin(),
            listActiveWorkLocationOptionsForSuperAdmin(),
            listRoleOptionsForSuperAdmin(),
          ])
        : await Promise.all([
            listProjectOptionsByOrganization(organizationId),
            listWorkLocationOptions(organizationId),
            listRoleOptionsByOrganization(organizationId),
          ]);

      return {
        isSuperAdmin,
        organizations: orgList,
        projects,
        workLocations,
        roles,
        userOrganizationId: authorization.isSuperAdmin ? null : organizationId,
      };
    })(),
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
            {hasActiveFilters ? " match your filters" : ""}
            {viewingOtherOrganization && viewedOrganizationName
              ? ` in ${viewedOrganizationName}.`
              : " in your organization."}
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
              {canImportExcel && importData ? (
                <ImportExcelDialog
                  organizations={importData.organizations}
                  projects={importData.projects}
                  workLocations={importData.workLocations}
                  roles={importData.roles}
                  isSuperAdmin={importData.isSuperAdmin}
                  userOrganizationId={importData.userOrganizationId}
                />
              ) : null}
              <CreateEmployeeDialog
                linkableUsers={linkableUsers}
                customFieldSpecs={customFieldSpecs}
              />
            </>
          ) : null}
        </div>
      </div>

      {viewingOtherOrganization && viewedOrganizationName ? (
        <div className="flex flex-col gap-2 rounded-md border border-sky-600/40 bg-sky-600/10 px-3 py-2 text-sm text-sky-800 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Anda sedang melihat karyawan organisasi{" "}
            <span className="font-semibold">{viewedOrganizationName}</span>.
            Perubahan di sini berlaku untuk tenant tersebut.
          </p>
          <Link
            href="/employees"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Kembali ke organisasi saya
          </Link>
        </div>
      ) : null}

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
            canPermanentDelete={canPermanentDelete}
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
                      page - 1,
                      viewedOrganizationId ?? undefined
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
                      page + 1,
                      viewedOrganizationId ?? undefined
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
