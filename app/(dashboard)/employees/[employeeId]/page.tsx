import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import {
  getUserAuthorization,
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import { updateEmployeeAction, createEmployeeAccountAction } from "@/features/employees/actions";
import { EmployeeEditor } from "@/features/employees/employee-editor";
import { EmployeeStatusBadge } from "@/features/employees/employee-status-badge";
import { EmployeePermanentDeleteDialog } from "@/features/employees/delete-employee-dialog";
import { canPermanentlyDeleteEmployees } from "@/features/employees/permanent-delete-policy";
import { CreateAccountDialog } from "@/features/employees/create-account-dialog";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  getEmployeeInOrganization,
  getOrganizationName,
  listLinkableUsers,
} from "@/features/employees/queries";
import { isFaceRecognitionConfigured } from "@/lib/attendance/face-recognition";
import { FaceEnrollmentPanel } from "@/features/employees/face-enrollment-panel";
import { FaceVerificationPanel } from "@/features/employees/face-verification-panel";
import { getFaceEnrollmentSummaryInOrganization } from "@/features/employees/face-enrollment.queries";
import {
  listEmployeeProjectAssignments,
} from "@/features/attendance/assignments.queries";
import { listOrganizationProjects } from "@/features/attendance/queries";
import { ProjectAssignmentManager } from "@/features/attendance/project-assignment-manager";

import {
  getEmployeeMasterData,
  listEmployeeAddresses,
  listEmployeeBankAccounts,
  listEmployeeCustomValues,
  listEmployeeDependents,
  listEmployeeDocuments,
  listEmployeeEducations,
  listEmployeeEmploymentHistory,
  getEmployeeInsurance,
} from "@/features/employees/master-data/queries";
import {
  listManagerOptions,
  listWorkLocationOptions,
} from "@/features/employees/master-data/queries-options";
import {
  listEmployeeAttendanceSummary,
  listEmployeeLeaveSummary,
  listEmployeePayslipSummary,
} from "@/features/employees/master-data/cross-module";
import {
  formatStoredValue,
} from "@/features/employee-fields/validation";
import { listActiveFieldDefinitions } from "@/features/employee-fields/queries";
import {
  AddressesSection,
  BankAccountsSection,
  CustomFieldsSection,
  DocumentsSection,
  EducationSection,
  EmploymentSection,
  FamilySection,
  HistorySection,
  InsuranceSection,
  OverviewSection,
  PersonalSection,
} from "@/features/employees/master-data/sections";
import {
  AttendanceTab,
  LeaveTab,
  PayrollTab,
} from "@/features/employees/master-data/cross-module-view";
import { EmployeeTabs } from "@/features/employees/master-data/employee-tabs";
import { listActiveCustomTabs } from "@/features/employee-tabs/queries";
import {
  defaultTabParam,
  isSelectableTab,
  mergeTabStrip,
  parseCustomTabParamKey,
  partitionFieldsForProfile,
  selectVisibleCustomTabs,
  type MergedTabEntry,
} from "@/features/employee-tabs/tabs";
import { Suspense } from "react";
import type { CustomFieldSpec } from "@/features/employees/master-data/custom-fields-section";
import {
  isFieldEditableByRoles,
  isFieldVisibleToRoles,
} from "@/features/employee-fields/filtering";

export const metadata: Metadata = {
  title: "Employee profile",
};

// The system tab param keys now live in features/employee-tabs/tabs.ts
// (SYSTEM_TABS) so the employee profile and the custom-tab merge order share
// ONE source of truth. Custom tabs arrive from the database at runtime, so
// they are not part of this static list.

function iso(value: Date | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

/**
 * Employee profile detail page (Employee Master Data 2.0).
 *
 * Tabbed layout over the master-data sections. Org-scoped: an employee id
 * that does not resolve in the caller's organization is forbidden, so
 * cross-organization existence is never revealed.
 *
 * Sensitive rendering rules (NIK / NPWP / BPJS / bank accounts / family NIK
 * / documents): the page decides per section what the caller may view
 * (`employees.<section>.view`) and may additionally reveal raw values only
 * when the caller holds `employees.<section>.update`. Masked forms are
 * computed on the SERVER before rendering, so raw identifiers never reach
 * the browser of a viewer who cannot reveal them.
 *
 * The Attendance / Leave / Payroll tabs are READ-ONLY projections that reuse
 * the existing modules (deep links to their own detail routes); none of
 * their business logic is duplicated here.
 */
export default async function EmployeeDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { employeeId } = await params;
  const search = await searchParams;
  // Validated against the merged strip BELOW (system + database-driven custom
  // tabs), so a deep link to a retired or unauthorized tab cannot render it.
  const requestedTabParam =
    typeof search.tab === "string" ? search.tab : null;

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.EMPLOYEES_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeInOrganization(employeeId, organizationId);
  if (!employee) forbidden();

  const [
    organizationName,
    canUpdate,
    canDeactivate,
    canCreateAccount,
    linkableUsers,
    canManageAssignments,
    personalView,
    personalUpdate,
    employmentView,
    employmentUpdate,
    addressView,
    addressUpdate,
    insuranceView,
    insuranceUpdate,
    bankView,
    bankUpdate,
    familyView,
    familyUpdate,
    educationView,
    educationUpdate,
    documentView,
    documentUpload,
    documentDelete,
    customDataView,
    customDataUpdate,
    attendanceView,
    leaveView,
    payslipView,
    payrollManage,
  ] = await Promise.all([
    getOrganizationName(organizationId),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DELETE),
    hasPermission(user.id, PERMISSIONS.USERS_CREATE),
    listLinkableUsers(organizationId, employeeId),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_PERSONAL_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EMPLOYMENT_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_ADDRESS_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_ADDRESS_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_INSURANCE_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_INSURANCE_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_BANK_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_BANK_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_FAMILY_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_FAMILY_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EDUCATION_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_EDUCATION_UPDATE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_UPLOAD),
    hasPermission(user.id, PERMISSIONS.EMPLOYEES_DOCUMENT_DELETE),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_VIEW),
    hasPermission(user.id, PERMISSIONS.EMPLOYEE_CUSTOM_DATA_UPDATE),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_VIEW),
    hasPermission(user.id, PERMISSIONS.LEAVE_VIEW),
    hasPermission(user.id, PERMISSIONS.PAYSLIP_VIEW),
    hasPermission(user.id, PERMISSIONS.PAYROLL_MANAGE),
  ]);

  // One authorization read serves the custom-field visibility rules and the
  // permanent-delete gate below.
  const authorization = await getUserAuthorization(user.id);

  // Permanent deletion is a separate, higher-privilege capability: the
  // `employees.permanent_delete` code AND the system-level SUPERADMIN role. Both
  // are evaluated server-side from the DB-backed authorization of the session,
  // and `permanentlyDeleteEmployeeAction` re-checks them — this only decides
  // whether the destructive action is offered on this page.
  const canPermanentDelete = canPermanentlyDeleteEmployees(authorization);

  // Section data is fetched ONLY for sections the caller may view.
  const [
    masterData,
    addresses,
    insurance,
    bankAccounts,
    dependents,
    educations,
    documents,
    history,
    customValues,
    customDefinitions,
    workLocations,
    managerOptions,
    attendanceRows,
    leaveRows,
    payslipRows,
  ] = await Promise.all([
    getEmployeeMasterData(employeeId, organizationId),
    addressView ? listEmployeeAddresses(employeeId, organizationId) : Promise.resolve([]),
    insuranceView ? getEmployeeInsurance(employeeId, organizationId) : Promise.resolve(null),
    bankView ? listEmployeeBankAccounts(employeeId, organizationId) : Promise.resolve([]),
    familyView ? listEmployeeDependents(employeeId, organizationId) : Promise.resolve([]),
    educationView ? listEmployeeEducations(employeeId, organizationId) : Promise.resolve([]),
    documentView ? listEmployeeDocuments(employeeId, organizationId) : Promise.resolve([]),
    employmentView ? listEmployeeEmploymentHistory(employeeId, organizationId) : Promise.resolve([]),
    customDataView ? listEmployeeCustomValues(employeeId, organizationId) : Promise.resolve([]),
    customDataView ? listActiveFieldDefinitions(organizationId) : Promise.resolve([]),
    employmentView || employmentUpdate
      ? listWorkLocationOptions(organizationId)
      : Promise.resolve([]),
    employmentUpdate ? listManagerOptions(organizationId, employeeId) : Promise.resolve([]),
    attendanceView ? listEmployeeAttendanceSummary(organizationId, employeeId) : Promise.resolve([]),
    leaveView ? listEmployeeLeaveSummary(organizationId, employeeId) : Promise.resolve([]),
    payslipView ? listEmployeePayslipSummary(organizationId, employeeId) : Promise.resolve([]),
  ]);
  if (!masterData) forbidden();

  // Custom Fields tab: definitions ∩ visibility rules for this caller.
  const roleCodesAsStrings = authorization.roleCodes as readonly string[];
  const visibleDefinitions = customDefinitions.filter((definition) =>
    isFieldVisibleToRoles(definition.visibilityConfig, roleCodesAsStrings)
  );
  const valuesByField = new Map(
    customValues.map((row) => [row.fieldDefinitionId, row])
  );
  // Employee Custom Tabs 2.0: the organization's ACTIVE tabs, filtered to the
  // ones this caller's roles may see. Organization scope is enforced by the
  // query itself (it is scoped to the session organization, never to input).
  const customTabs = customDataView
    ? await listActiveCustomTabs(organizationId)
    : [];
  const visibleCustomTabs = selectVisibleCustomTabs(customTabs, roleCodesAsStrings);

  const customSpecs: CustomFieldSpec[] = visibleDefinitions.map((definition) => {
    const stored = valuesByField.get(definition.id);
    const editable =
      customDataUpdate &&
      isFieldEditableByRoles(definition.editableByConfig, roleCodesAsStrings);
    return {
      id: definition.id,
      fieldKey: definition.fieldKey,
      label: definition.label,
      description: definition.description,
      fieldType: definition.fieldType,
      isRequired: definition.isRequired,
      options: definition.options,
      currentValue: stored
        ? definition.fieldType === "checkbox"
          ? stored.valueBoolean
            ? "true"
            : ""
          : definition.fieldType === "date" && stored.valueDate
            ? iso(stored.valueDate)
            : formatStoredValue(definition.fieldType, {
                valueText: stored.valueText,
                valueNumber: stored.valueNumber,
                valueDate: stored.valueDate,
                valueBoolean: stored.valueBoolean,
                valueJson: (stored.valueJson ?? null) as string[] | null,
              })
        : "",
      canEdit: Boolean(editable),
    };
  });

  // Placement is computed from the VISIBLE tab list: a field parked on a tab
  // this caller cannot see (or on a retired one) falls through to the built-in
  // Custom Fields tab rather than vanishing. Partitioning the definitions and
  // projecting through `specById` keeps each field in exactly one bucket, so
  // nothing is duplicated and nothing is dropped.
  const specById = new Map(customSpecs.map((spec) => [spec.id, spec]));
  const { byTab, fallback } = partitionFieldsForProfile(
    visibleDefinitions,
    visibleCustomTabs
  );
  const specsByTabKey = new Map<string, CustomFieldSpec[]>();
  for (const [tabKey, definitions] of byTab) {
    specsByTabKey.set(
      tabKey,
      definitions
        .map((definition) => specById.get(definition.id))
        .filter((spec): spec is CustomFieldSpec => Boolean(spec))
    );
  }
  const fallbackSpecs = fallback
    .map((definition) => specById.get(definition.id))
    .filter((spec): spec is CustomFieldSpec => Boolean(spec));

  const faceEnrollmentSummary = await getFaceEnrollmentSummaryInOrganization(
    organizationId,
    employee.id
  );
  const faceEngineConfigured = isFaceRecognitionConfigured();

  const displayName = `${employee.firstName} ${employee.lastName}`;

  // One merged, metadata-driven strip. System tabs keep their own permission
  // gate; custom tabs are the database rows already filtered to active +
  // role-visible. A custom tab with no visible field renders as a real tab
  // with an explicit empty state (an administrator is mid-configuration) —
  // decided in `tabContent` below, not by hiding the tab here.
  const strip: MergedTabEntry[] = mergeTabStrip(visibleCustomTabs, {
    overview: true,
    personal: personalView,
    employment: employmentView,
    address: addressView,
    insurance: insuranceView,
    bank: bankView,
    family: familyView,
    education: educationView,
    documents: documentView,
    custom: customDataView,
    attendance: attendanceView,
    leave: leaveView,
    payroll: payslipView,
    history: employmentView,
  });
  const tabs = strip.map((entry) => ({
    key: entry.key,
    label: entry.label,
    visible: entry.visible,
  }));
  const activeTab = isSelectableTab(strip, requestedTabParam)
    ? requestedTabParam
    : defaultTabParam(strip);

  const tabContent: React.ReactNode = (() => {
    switch (activeTab) {
      case "overview":
        return (
          <div className="space-y-6">
            <OverviewSection
              employee={masterData}
              canUpdate={canUpdate}
              canDeactivate={canDeactivate}
              organizationName={organizationName}
              revealPhone={personalUpdate}
            />
            {!employee.userId ? (
              <AccountCard
                employeeId={employee.id}
                employeeEmail={employee.email}
                canCreate={canCreateAccount}
                action={createEmployeeAccountAction}
              />
            ) : null}
            <FaceIdentityCards
              employee={employee}
              displayName={displayName}
              canUpdate={canUpdate}
              canDeactivate={canDeactivate}
              linkableUsers={linkableUsers}
              faceEnrollmentSummary={faceEnrollmentSummary}
              faceEngineConfigured={faceEngineConfigured}
            />
          </div>
        );
      case "personal":
        return (
          <PersonalSection
            employee={masterData}
            canEdit={personalUpdate}
            reveal={personalUpdate}
          />
        );
      case "employment":
        return (
          <EmploymentSection
            employee={masterData}
            canEdit={employmentUpdate}
            workLocations={workLocations}
            managers={managerOptions}
          />
        );
      case "address":
        return (
          <AddressesSection
            employeeId={employeeId}
            addresses={addresses}
            canEdit={addressUpdate}
          />
        );
      case "insurance":
        return (
          <InsuranceSection
            employeeId={employeeId}
            insurance={insurance}
            canEdit={insuranceUpdate}
            reveal={insuranceUpdate}
          />
        );
      case "bank":
        return (
          <BankAccountsSection
            employeeId={employeeId}
            accounts={bankAccounts}
            canEdit={bankUpdate}
            reveal={bankUpdate}
          />
        );
      case "family":
        return (
          <FamilySection
            employeeId={employeeId}
            dependents={dependents}
            canEdit={familyUpdate}
            reveal={personalUpdate}
          />
        );
      case "education":
        return (
          <EducationSection
            employeeId={employeeId}
            educations={educations}
            canEdit={educationUpdate}
          />
        );
      case "documents":
        return (
          <DocumentsSection
            employeeId={employeeId}
            documents={documents}
            canUpload={documentUpload}
            canDelete={documentDelete}
          />
        );
      case "custom":
        // Built-in tab shows only the fields NOT placed on a visible custom tab,
        // so a field is never rendered in two places.
        return (
          <CustomFieldsSection
            employeeId={employeeId}
            specs={fallbackSpecs}
          />
        );
      case "attendance":
        return (
          <AttendanceTab
            rows={attendanceRows}
          />
        );
      case "leave":
        return <LeaveTab rows={leaveRows} />;
      case "payroll":
        return (
          <PayrollTab
            rows={payslipRows}
            canManage={payrollManage}
          />
        );
      case "history":
        return <HistorySection history={history} />;
      default: {
        // A custom tab (`custom:<tabKey>`): rendered by the SAME generic
        // definition-driven form as the built-in tab, with the tab's own
        // name/description from the database. No per-tab component, no
        // hard-coded tab names. `activeTab` was already proven visible by
        // `isSelectableTab`, so this can only be an authorized, active tab.
        const tabKey = parseCustomTabParamKey(activeTab);
        const tab = tabKey
          ? visibleCustomTabs.find((candidate) => candidate.tabKey === tabKey)
          : undefined;
        if (!tabKey || !tab) return null;
        return (
          <CustomFieldsSection
            employeeId={employeeId}
            specs={specsByTabKey.get(tabKey) ?? []}
            title={tab.icon ? `${tab.icon} ${tab.name}` : tab.name}
            description={tab.description ?? "Fields assigned to this custom tab."}
            emptyMessage="No visible custom fields are assigned to this tab yet."
          />
        );
      }
    }
  })();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {displayName}
          </h1>
          <EmployeeStatusBadge status={employee.employmentStatus} />
          <span className="font-mono text-xs text-muted-foreground">
            {employee.employeeNumber}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {payslipView ? (
            <Link
              href={`/api/employees/export?format=excel&employeeNo=${encodeURIComponent(employee.employeeNumber)}`}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Export Excel
            </Link>
          ) : null}
          <Link
            href="/employees"
            className={buttonVariants({ variant: "outline", size: "sm" })}
          >
            Back to employees
          </Link>
          {/* Same permanent-deletion flow as the employee list — one dialog,
              one server action, one set of guards. Gated on
              `employees.permanent_delete`, NOT on `employees.delete`, so
              Deactivate and Permanent Delete stay independently gated. */}
          {canPermanentDelete ? (
            <EmployeePermanentDeleteDialog
              employee={{
                id: employee.id,
                employeeNumber: employee.employeeNumber,
                firstName: employee.firstName,
                lastName: employee.lastName,
                employmentStatus: employee.employmentStatus,
                department: employee.department,
                position: employee.position,
              }}
              redirectTo="/employees"
            />
          ) : null}
        </div>
      </div>

      <Suspense>
        <EmployeeTabs tabs={tabs} active={activeTab} />
      </Suspense>

      {tabContent}

      {!canUpdate && activeTab === "overview" ? (
        <div className="flex items-center gap-2">
          <Badge variant="outline">Read only</Badge>
          <span className="text-sm text-muted-foreground">
            You have view access to this employee record.
          </span>
        </div>
      ) : null}

      {canManageAssignments ? (
        <AssignmentSection
          employeeId={employeeId}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}

async function AssignmentSection({
  employeeId,
  organizationId,
}: {
  employeeId: string;
  organizationId: string;
}) {
  const [assignments, orgProjects] = await Promise.all([
    listEmployeeProjectAssignments(organizationId, employeeId),
    listOrganizationProjects(organizationId),
  ]);
  const assignedActiveProjectIds = new Set(
    assignments.filter((assignment) => assignment.active).map((assignment) => assignment.projectId)
  );
  const assignableProjects = orgProjects.filter(
    (project) => !assignedActiveProjectIds.has(project.id)
  );
  return (
    <ProjectAssignmentManager
      employeeId={employeeId}
      assignments={assignments}
      assignableProjects={assignableProjects}
    />
  );
}

function AccountCard({
  employeeId,
  employeeEmail,
  canCreate,
  action,
}: {
  employeeId: string;
  employeeEmail: string | null;
  canCreate: boolean;
  action: typeof createEmployeeAccountAction;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Account</CardTitle>
        <CardDescription>Linked sign-in account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-muted-foreground">No login account is linked.</p>
        <CreateAccountDialog
          employeeId={employeeId}
          employeeEmail={employeeEmail}
          action={action}
          canCreate={canCreate}
        />
      </CardContent>
    </Card>
  );
}

function FaceIdentityCards({
  employee,
  displayName,
  canUpdate,
  canDeactivate,
  linkableUsers,
  faceEnrollmentSummary,
  faceEngineConfigured,
}: {
  employee: Awaited<ReturnType<typeof getEmployeeInOrganization>>;
  displayName: string;
  canUpdate: boolean;
  canDeactivate: boolean;
  linkableUsers: Awaited<ReturnType<typeof listLinkableUsers>>;
  faceEnrollmentSummary: Awaited<ReturnType<typeof getFaceEnrollmentSummaryInOrganization>>;
  faceEngineConfigured: boolean;
}) {
  if (!employee) return null;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div>
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
        ) : null}

      </div>
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium">Face identity</h3>
          <FaceEnrollmentPanel
            employeeId={employee.id}
            employeeName={displayName}
            status={faceEnrollmentSummary.status}
            canManage={canUpdate}
            engineConfigured={faceEngineConfigured}
          />
        </div>
        {canUpdate && faceEngineConfigured ? (
          <div>
            <h3 className="mb-2 text-sm font-medium">Face verification</h3>
            <FaceVerificationPanel
              employeeId={employee.id}
              employeeName={displayName}
              status={faceEnrollmentSummary.status}
              canVerify={canUpdate}
              engineConfigured={faceEngineConfigured}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
