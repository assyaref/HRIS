import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission, requirePermission } from "@/lib/auth/rbac";

import { updateEmployeeAction, createEmployeeAccountAction } from "@/features/employees/actions";
import { EmployeeEditor } from "@/features/employees/employee-editor";
import { EmployeeStatusBadge } from "@/features/employees/employee-status-badge";
import { CreateAccountDialog } from "@/features/employees/create-account-dialog";
import {
  getEmployeeInOrganization,
  getOrganizationName,
  listLinkableUsers,
} from "@/features/employees/queries";

export const metadata: Metadata = {
  title: "Employee profile",
};

function formatDate(value: Date | null): string {
  if (!value) return "—";
  return value.toISOString().slice(0, 10);
}

function formatDateTime(value: Date): string {
  return value.toISOString().slice(0, 16).replace("T", " ");
}

/**
 * Employee profile detail page.
 *
 * Org-scoped: an employee id that does not resolve in the caller's
 * organization is treated as forbidden, so cross-organization existence is
 * never revealed. Only Phase 5 fields are shown; no credentials, password
 * hashes or session material are ever rendered.
 */
export default async function EmployeeDetailPage({
  params,
}: {
  params: Promise<{ employeeId: string }>;
}) {
  const { employeeId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeInOrganization(employeeId, organizationId);
  if (!employee) forbidden();

  const [organizationName, canUpdate, canDeactivate, canCreateAccount, linkableUsers] =
    await Promise.all([
      getOrganizationName(organizationId),
      hasPermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE),
      hasPermission(user.id, PERMISSIONS.EMPLOYEES_DELETE),
      hasPermission(user.id, PERMISSIONS.USERS_CREATE),
      listLinkableUsers(organizationId, employeeId),
    ]);

  const displayName = `${employee.firstName} ${employee.lastName}`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {displayName}
          </h1>
          <EmployeeStatusBadge status={employee.employmentStatus} />
        </div>
        <Link
          href="/employees"
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to employees
        </Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Personal and contact information.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">First name</span>
              <span className="font-medium">{employee.firstName}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Last name</span>
              <span className="font-medium">{employee.lastName}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Email</span>
              <span className="font-medium break-all">
                {employee.email ?? "—"}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Phone</span>
              <span className="font-medium">{employee.phone ?? "—"}</span>
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Employment</CardTitle>
            <CardDescription>
              Organization and employment details.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Employee number</span>
              <span className="font-mono text-xs font-medium">
                {employee.employeeNumber}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Organization</span>
              <span className="font-medium">{organizationName ?? "—"}</span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Hire date</span>
              <span className="font-medium">
                {formatDate(employee.hireDate)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Status</span>
              <EmployeeStatusBadge status={employee.employmentStatus} />
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>Linked sign-in account.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {employee.userId ? (
              <>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Email</span>
                  <span className="font-medium break-all">
                    {employee.linkedUserEmail ?? "—"}
                  </span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Role</span>
                  <span className="font-medium">EMPLOYEE</span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Status</span>
                  <span className="font-medium capitalize">
                    {employee.linkedUserStatus ?? "—"}
                  </span>
                </p>
                {/* Reset Password and Disable Account buttons can be added in future iterations */}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground">
                  No login account is linked.
                </p>
                <CreateAccountDialog
                  employeeId={employee.id}
                  employeeEmail={employee.email}
                  action={createEmployeeAccountAction}
                  canCreate={canCreateAccount}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>System</CardTitle>
            <CardDescription>Record metadata.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Created</span>
              <span className="font-medium">
                {formatDateTime(employee.createdAt)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Last updated</span>
              <span className="font-medium">
                {formatDateTime(employee.updatedAt)}
              </span>
            </p>
            <p className="flex justify-between gap-4">
              <span className="text-muted-foreground">Record ID</span>
              <span className="font-mono text-xs">{employee.id}</span>
            </p>
          </CardContent>
        </Card>
      </div>
      {canUpdate ? (
        <EmployeeEditor
          employeeId={employee.id}
          employeeNumber={employee.employeeNumber}
          firstName={employee.firstName}
          lastName={employee.lastName}
          email={employee.email ?? ""}
          phone={employee.phone ?? ""}
          hireDate={
            employee.hireDate
              ? employee.hireDate.toISOString().slice(0, 10)
              : ""
          }
          employmentStatus={employee.employmentStatus}
          userId={employee.userId ?? ""}
          canDeactivate={canDeactivate}
          linkableUsers={linkableUsers}
          action={updateEmployeeAction.bind(null, employee.id)}
        />
      ) : (
        <div className="flex items-center gap-2">
          <Badge variant="outline">Read only</Badge>
          <span className="text-sm text-muted-foreground">
            You have view access to this employee record.
          </span>
        </div>
      )}
    </div>
  );
}