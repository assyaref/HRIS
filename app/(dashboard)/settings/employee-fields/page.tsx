import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { listFieldDefinitions } from "@/features/employee-fields/queries";
import { EmployeeFieldsManager } from "@/features/employee-fields/manager";
import { EmployeeTabsManager } from "@/features/employee-tabs/manager";
import {
  countActiveFieldsPerTab,
  listCustomTabs,
} from "@/features/employee-tabs/queries";
import { listRolesByOrganization } from "@/features/rbac/queries";

export const metadata: Metadata = {
  title: "Employee Fields",
};

/**
 * Employee custom field definition management (Settings → Employee Fields).
 *
 * Organization-scoped: only the caller's own definitions and tabs are
 * listed. The manager components render create/edit/duplicate/status/
 * reorder controls; every action re-authorizes server-side.
 */
export default async function EmployeeFieldsPage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_VIEW);
  if (!user.organizationId) forbidden();

  const [
    definitions,
    canCreate,
    canUpdate,
    canDelete,
    organizationRoles,
    customTabs,
  ] = await Promise.all([
    listFieldDefinitions(user.organizationId),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_CREATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_FIELDS_DELETE),
    listRolesByOrganization(user.organizationId),
    listCustomTabs(user.organizationId),
  ]);
  const fieldCounts = await countActiveFieldsPerTab(user.organizationId);

  const roleOptionsByCode = new Map(
    organizationRoles.map((role) => [role.code, { value: role.code, label: role.name }])
  );
  for (const definition of definitions) {
    for (const code of [
      ...definition.visibilityConfig,
      ...definition.editableByConfig,
    ]) {
      if (!roleOptionsByCode.has(code)) {
        roleOptionsByCode.set(code, { value: code, label: `${code} (inactive)` });
      }
    }
  }
  for (const tab of customTabs) {
    for (const code of tab.visibilityConfig) {
      if (!roleOptionsByCode.has(code)) {
        roleOptionsByCode.set(code, { value: code, label: `${code} (inactive)` });
      }
    }
  }
  const roleOptions = [...roleOptionsByCode.values()];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Employee Fields
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Custom tabs and custom field definitions are the single source of
          truth: tabs and fields created here appear automatically on employee
          detail, the Excel template, import and export — no code changes
          needed.
        </p>
      </div>

      <EmployeeTabsManager
        tabs={customTabs}
        fieldCounts={Object.fromEntries(
          [...fieldCounts.entries()].map(([key, count]) => [key, count])
        )}
        canCreate={canCreate}
        canUpdate={canUpdate}
        roleOptions={roleOptions}
      />

      <EmployeeFieldsManager
        definitions={definitions}
        canCreate={canCreate}
        canUpdate={canUpdate}
        canDelete={canDelete}
        roleOptions={roleOptions}
        customTabs={customTabs}
      />
    </div>
  );
}
