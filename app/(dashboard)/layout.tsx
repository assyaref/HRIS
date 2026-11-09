import type { ReactNode } from "react";

import { getAuthorizedSections } from "@/components/layout/authorized-navigation";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { EmployeeBottomNavigation } from "@/components/employee/employee-bottom-navigation";
import { EmployeeMobileBottomNav } from "@/components/employee/mobile-bottom-nav";
import { EmployeeMobileHeader } from "@/components/employee/mobile-header";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";
import { hasManagementDashboard } from "@/features/dashboard/access";
import { getOrganizationName } from "@/features/employees/queries";
import { getEmployeeSelfProfile } from "@/features/employees/queries";
import { listMyNotifications } from "@/features/notifications/queries";

/**
 * Authenticated application shell (route group `(dashboard)`).
 *
 * The auth guard runs here, server-side, for every route in this group:
 * unauthenticated requests are redirected to /login before any page renders.
 * Navigation is permission-filtered server-side before it reaches the shell;
 * the signed-in user's role and organization are resolved once and shared by
 * the sidebar and header. Responsive: sidebar on `lg+`, drawer below `lg`.
 *
 * Self-service employees get the mobile-first HRIS Lite shell on mobile
 * (< lg): EmployeeMobileHeader (hamburger + drawer + notification badge +
 * avatar) and EmployeeMobileBottomNav (Beranda · Absensi · Scan · Cuti ·
 * Profil). Management/administrative users keep the existing shell
 * (Header + MobileBottomNav). Desktop (lg+) preserves the existing layout
 * for all roles. This decision never grants access — every route remains
 * guarded server-side.
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

  const organizationName = currentUser.organizationId
    ? await getOrganizationName(currentUser.organizationId)
    : null;

  const roleLabel = displayRoleLabel(authorization.roleCodes);
  const share = { organizationName, roleLabel };
  const isManagement = hasManagementDashboard(authorization.permissionCodes);
  const isSelfService = !isManagement;
  const canAttendance = authorization.permissionCodes.includes(
    PERMISSIONS.ATTENDANCE_VIEW
  );

  // Employee data for the mobile header (self-service only).
  let employee: {
    name: string;
    employeeNumber: string;
    role: string;
    avatar: string | null;
  } | null = null;
  let notificationCount = 0;
  let authorizedHrefs: string[] = [];

  if (isSelfService && currentUser.organizationId) {
    const [profile, notifications] = await Promise.all([
      getEmployeeSelfProfile(currentUser.id, currentUser.organizationId),
      listMyNotifications(currentUser.id, currentUser.organizationId),
    ]);
    notificationCount = notifications.unreadCount;
    authorizedHrefs = sections.flatMap((section) =>
      section.items.map((item) => item.href)
    );
    if (profile) {
      employee = {
        name: `${profile.firstName} ${profile.lastName}`,
        employeeNumber: profile.employeeNumber,
        role: roleLabel ?? "Karyawan",
        avatar: profile.profilePhotoUrl,
      };
    }
  }

  return (
    <div className="flex min-h-svh flex-col bg-background font-sans text-foreground lg:flex-row">
      <Sidebar sections={sections} user={currentUser} {...share} />
      <div className="flex min-w-0 flex-1 flex-col">
        {isSelfService ? (
          <>
            {/* Desktop header (lg+) — preserves existing shell. */}
            <div className="hidden lg:block">
              <Header user={currentUser} sections={sections} {...share} />
            </div>
            {/* Mobile header (hidden lg) — HRIS Lite Enterprise shell. */}
            <div className="lg:hidden">
              {employee ? (
                <EmployeeMobileHeader
                  organizationName={organizationName}
                  employee={employee}
                  notificationCount={notificationCount}
                  authorizedHrefs={authorizedHrefs}
                />
              ) : (
                <Header user={currentUser} sections={sections} {...share} />
              )}
            </div>
          </>
        ) : (
          <Header user={currentUser} sections={sections} {...share} />
        )}
        <main
          className={[
            "mx-auto w-full max-w-7xl flex-1 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8 lg:pb-8",
            isManagement ? "pb-24" : "pb-36",
          ].join(" ")}
        >
          {children}
        </main>
        {isSelfService ? (
          <EmployeeMobileBottomNav canAttendance={canAttendance} />
        ) : isManagement ? (
          <MobileBottomNav sections={sections} />
        ) : (
          <EmployeeBottomNavigation canAttendance={canAttendance} />
        )}
      </div>
    </div>
  );
}
