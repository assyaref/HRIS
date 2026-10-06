import type { ReactNode } from "react";

import { getAuthorizedSections } from "@/components/layout/authorized-navigation";
import { Header } from "@/components/layout/header";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
import { Sidebar } from "@/components/layout/sidebar";
import { EmployeeBottomNavigation } from "@/components/employee/employee-bottom-navigation";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { getUserAuthorization } from "@/lib/auth/rbac";
import { displayRoleLabel } from "@/lib/auth/roles";
import { hasManagementDashboard } from "@/features/dashboard/access";
import { getOrganizationName } from "@/features/employees/queries";

/**
 * Authenticated application shell (route group `(dashboard)`).
 *
 * The auth guard runs here, server-side, for every route in this group:
 * unauthenticated requests are redirected to /login before any page renders.
 * Navigation is permission-filtered server-side before it reaches the shell;
 * the signed-in user's role and organization are resolved once and shared by
 * the sidebar and header. Responsive: sidebar on `lg+`, drawer below `lg`.
 *
 * The mobile bottom bar is role-aware: management/administrative users keep
 * the existing module navigation, while self-service employees get the
 * mobile-first HRIS app bar (Beranda · Kehadiran · Presensi · Notifikasi ·
 * Saya). This decision mirrors the dashboard split and never grants access —
 * every route remains guarded server-side.
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
  const canAttendance = authorization.permissionCodes.includes(
    PERMISSIONS.ATTENDANCE_VIEW
  );

  return (
    <div className="flex min-h-svh flex-col bg-background font-sans text-foreground lg:flex-row">
      <Sidebar sections={sections} user={currentUser} {...share} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header user={currentUser} sections={sections} {...share} />
        <main
          className={[
            "mx-auto w-full max-w-7xl flex-1 px-4 pt-6 sm:px-6 lg:px-8 lg:pt-8 lg:pb-8",
            isManagement ? "pb-24" : "pb-36",
          ].join(" ")}
        >
          {children}
        </main>
        {isManagement ? (
          <MobileBottomNav sections={sections} />
        ) : (
          <EmployeeBottomNavigation canAttendance={canAttendance} />
        )}
      </div>
    </div>
  );
}