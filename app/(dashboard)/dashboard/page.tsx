import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { requireUser } from "@/lib/auth/auth";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";
import { getOrganizationName } from "@/features/employees/queries";

import { hasManagementDashboard } from "@/features/dashboard/access";
import { EmployeeDashboard } from "@/features/dashboard/employee-dashboard";
import { ManagementDashboard } from "@/features/dashboard/management-dashboard";

export const metadata: Metadata = {
  title: "Dashboard",
};

/**
 * Role-aware landing page.
 *
 * Authorization is resolved server-side and the view is chosen by capability,
 * never by a client-supplied flag:
 *  - Management capabilities (employee oversight, approvals, payroll,
 *    settings, audit) → organization-wide management dashboard.
 *  - Self-service only → personal employee dashboard (attendance, leave,
 *    permission, payslip).
 * Every metric rendered by either view comes from organization-scoped
 * server queries, so cross-organization data is structurally unreachable.
 */
export default async function DashboardPage() {
  const user = await requireUser();

  if (!user.organizationId) {
    forbidden();
  }
  const organizationId = user.organizationId;

  const [authorization, organizationName] = await Promise.all([
    getUserAuthorization(user.id),
    getOrganizationName(organizationId),
  ]);

  const roleLabel = displayRoleLabel(authorization.roleCodes);

  if (hasManagementDashboard(authorization.permissionCodes)) {
    return (
      <ManagementDashboard
        user={user}
        authorization={authorization}
        organizationName={organizationName}
        roleLabel={roleLabel}
      />
    );
  }

  return (
    <EmployeeDashboard
      user={user}
      authorization={authorization}
      organizationName={organizationName}
      roleLabel={roleLabel}
    />
  );
}