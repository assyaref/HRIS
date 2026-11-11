import type { ReactNode } from "react";

import { getAuthorizedSections } from "@/components/layout/authorized-navigation";
import { AppShell } from "@/components/layout/app-shell";
import type { ShellProfile } from "@/components/layout/shell-context";
import { EmployeeBottomNavigation } from "@/components/employee/employee-bottom-navigation";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { listActingOrganizationOptions } from "@/lib/auth/acting-organization";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";
import { indonesianGreeting, initialsOf } from "@/lib/utils/greeting";
import { getOrganizationName } from "@/features/employees/queries";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { listMyNotifications } from "@/features/notifications/queries";
import { organizationLogoUrl } from "@/lib/organizations/logo-storage";

/**
 * Authenticated application shell (route group `(dashboard)`).
 *
 * The auth guard runs here, server-side, for every route in this group:
 * unauthenticated requests are redirected to /login before any page renders.
 * Navigation is permission-filtered server-side before it reaches the shell;
 * the signed-in user's identity, role and organization are resolved once and
 * shared by the sidebar, the blue header band and the mobile drawer.
 *
 * HRIS Lite Enterprise v2.0: every role gets the same shell — white sidebar
 * on `lg+`, blue header band with the greeting hero on Beranda, drawer and
 * bottom navigation (with the raised ABSEN action) below `lg`. This decision
 * never grants access — every route remains guarded server-side.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const currentUser = await requireUser();

  const [sections, authorization] = await Promise.all([
    getAuthorizedSections(currentUser.id),
    getUserAuthorization(currentUser.id),
  ]);

  const organizationId = currentUser.organizationId;
  const [organizationName, employee, notifications, logoUrl] = organizationId
    ? await Promise.all([
        getOrganizationName(organizationId),
        getEmployeeSelfProfile(currentUser.id, organizationId),
        listMyNotifications(currentUser.id, organizationId),
        organizationLogoUrl(organizationId),
      ])
    : [null, null, null, null];

  const organizationOptions = authorization.isSuperAdmin
    ? await listActingOrganizationOptions()
    : undefined;

  const roleLabel = displayRoleLabel(authorization.roleCodes);
  const canAttendance = authorization.permissionCodes.includes(
    PERMISSIONS.ATTENDANCE_VIEW
  );

  const displayName = employee
    ? `${employee.firstName} ${employee.lastName}`.trim()
    : currentUser.email.split("@")[0];

  const profile: ShellProfile = {
    displayName,
    email: currentUser.email,
    initials: initialsOf(displayName),
    employeeNumber: employee?.employeeNumber ?? null,
    roleLabel: roleLabel ?? (employee ? "Karyawan" : null),
    position: employee?.position ?? null,
    avatarUrl: employee?.profilePhotoUrl ?? null,
    organizationName,
    organizationLogoUrl: logoUrl,
    greeting: indonesianGreeting(),
    isSuperAdmin: authorization.isSuperAdmin,
    activeOrganizationId: organizationId,
    organizationOptions,
  };

  return (
    <AppShell
      sections={sections}
      profile={profile}
      notificationCount={notifications?.unreadCount ?? 0}
      bottomNav={<EmployeeBottomNavigation canAttendance={canAttendance} />}
    >
      {children}
    </AppShell>
  );
}
