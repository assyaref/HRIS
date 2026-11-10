import type { Metadata } from "next";
import { forbidden } from "next/navigation";

import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";
import { currentYearInAppTimeZone } from "@/features/leave/master.year";
import {
  LeaveBalanceManager,
  LeaveTypeManager,
} from "@/features/leave/leave-master-manager";
import {
  listLeaveBalancesForAdmin,
  listLeaveEmployeeOptions,
  listLeaveTypesForAdmin,
} from "@/features/leave/master.queries";
import { leaveBalanceFilterSchema } from "@/features/leave/master.schemas";
import { getOrganizationName } from "@/features/employees/queries";

export const metadata: Metadata = {
  title: "Jenis & Saldo Cuti",
};

function readParam(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Leave master data: leave types (CRUD) and per-employee leave balances
 * (CRUD + bulk generation). Gate: `leave.manage`, re-checked by every action.
 * Scoped to the session organization (a Super Administrator's acting
 * organization).
 */
export default async function LeaveTypesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.LEAVE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const params = await searchParams;
  const parsed = leaveBalanceFilterSchema.parse({
    year: readParam(params.year),
    leaveTypeId: readParam(params.leaveTypeId) || undefined,
    q: readParam(params.q) || undefined,
  });
  const year = parsed.year ?? currentYearInAppTimeZone();

  const [types, employees, organizationName] = await Promise.all([
    listLeaveTypesForAdmin(organizationId),
    listLeaveEmployeeOptions(organizationId),
    getOrganizationName(organizationId),
  ]);
  const leaveTypeId =
    parsed.leaveTypeId && types.some((type) => type.id === parsed.leaveTypeId)
      ? parsed.leaveTypeId
      : undefined;
  const balances = await listLeaveBalancesForAdmin(organizationId, {
    year,
    leaveTypeId,
    q: parsed.q,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Jenis &amp; Saldo Cuti
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          Master jenis cuti dan saldo cuti karyawan
          {organizationName ? ` · ${organizationName}` : ""}.
        </p>
      </div>

      <LeaveTypeManager types={types} />

      <LeaveBalanceManager
        balances={balances}
        types={types}
        employees={employees}
        year={year}
        leaveTypeId={leaveTypeId ?? ""}
        q={parsed.q ?? ""}
      />
    </div>
  );
}
