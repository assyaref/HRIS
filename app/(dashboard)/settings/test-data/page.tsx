import type { Metadata } from "next";

import { Badge } from "@/components/ui/badge";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";

import {
  TestDataPurgePanel,
  type PurgeableTestEmployee,
} from "@/features/employees/test-data-purge-panel";
import { listTestDataEmployees } from "@/features/employees/test-data-purge.queries";
import { TEST_DATA_EMPLOYEE_NUMBER_PREFIX } from "@/features/employees/test-data-purge-policy";

export const metadata: Metadata = {
  title: "Test Data",
};

/**
 * Test Data Management (SUPERADMIN only).
 *
 * PAGE GUARD — server-side, both conditions required:
 * 1. the `employees.test_data_purge` capability code, and
 * 2. the system-level SUPERADMIN role.
 *
 * The capability is declared in the shared `SYSTEM_ONLY_PERMISSION_CODES` list,
 * so the RBAC seed refuses to store it on a tenant role and the role editor
 * rejects the assignment. This page and its server action still re-check: the
 * permission is the control, the navigation link is only a convenience.
 *
 * The list is produced by a DATABASE-side `LIKE 'EMP-TEST-%'` filter scoped to
 * the caller's organization, so a production employee is never loaded and can
 * never be presented as eligible.
 */
export default async function TestDataPage() {
  const user = await requireUser();
  const authorization = await getUserAuthorization(user.id);

  const allowed =
    authorization.isSuperAdmin &&
    authorization.permissionCodes.includes(PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE);

  if (!allowed) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Test Data
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            Remove records this organization created as test data.
          </p>
        </div>
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          This page is restricted to Super Administrators and requires the
          &quot;{PERMISSIONS.EMPLOYEES_TEST_DATA_PURGE}&quot; capability.
        </div>
      </div>
    );
  }

  const employees: PurgeableTestEmployee[] = user.organizationId
    ? await listTestDataEmployees(user.organizationId)
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Test Data
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Remove records this organization created as test data, without
          touching production employees.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-destructive">
            Permanent deletion — this cannot be undone
          </p>
          <Badge variant="destructive">SUPERADMIN only</Badge>
        </div>
        <ul className="space-y-1 text-sm text-destructive/90">
          <li>
            Nothing outside that prefix is ever eligible, and the filter runs in
            the database.
          </li>
          <li>
            Test Data Purge is restricted to employees whose employee number
            starts with{" "}
            <span className="font-mono">{TEST_DATA_EMPLOYEE_NUMBER_PREFIX}</span>.
            Only records classified as eligible TEST data can be removed.
            Protected production records and unrelated records will block the
            purge.
          </li>
          <li>
            Employment history belonging to eligible{" "}
            <span className="font-mono">{TEST_DATA_EMPLOYEE_NUMBER_PREFIX}</span>
            records may be removed as part of the TEST DATA exception. This does
            not change the normal Permanent Delete policy.
          </li>
          <li>
            Deletion runs in a single transaction. If any protected record is
            found, nothing is deleted at all.
          </li>
          <li>
            Every attempt is recorded in the audit log, including refusals.
          </li>
        </ul>
      </div>

      <TestDataPurgePanel employees={employees} />
    </div>
  );
}
