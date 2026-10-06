import type { Metadata } from "next";
import Link from "next/link";
import { forbidden } from "next/navigation";

import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/rbac";

import {
  LocationStatusBadge,
  VerificationStatusBadge,
} from "@/features/attendance/attendance-badges";
import { formatDate, formatTime } from "@/features/attendance/format";
import {
  AttendanceRateBadge,
  RecapDayStatusBadge,
} from "@/features/attendance/recap-badges";
import {
  getAttendanceRecapFilterOptions,
  getEmployeeAttendanceRecapDetail,
} from "@/features/attendance/recap.queries";
import { monthPeriodOf } from "@/features/attendance/recap";
import { recapPeriodParamsSchema } from "@/features/attendance/recap.schemas";

export const metadata: Metadata = {
  title: "Employee attendance recap",
};

function readParam(
  value: string | string[] | undefined
): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

/** "Mon", "Tue", … label for a YYYY-MM-DD string. */
function weekdayLabel(day: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      weekday: "short",
      timeZone: "UTC",
    }).format(new Date(`${day}T00:00:00.000Z`));
  } catch {
    return "—";
  }
}

/**
 * Employee attendance recap detail (management drill-down).
 *
 * Shows why the recap numbers are what they are for ONE employee in the
 * selected period: the same summary as the recap table, then the classified
 * daily rows. Every day with an accepted attendance links to the existing
 * attendance detail page (geofence, verification and the immutable event
 * history). Organization scoped: a cross-organization employee id renders
 * forbidden.
 */
export default async function EmployeeAttendanceRecapPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { employeeId } = await params;
  const periodParams = await searchParams;

  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_MANAGE);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const parsed = recapPeriodParamsSchema.safeParse({
    startDate: readParam(periodParams.startDate),
    endDate: readParam(periodParams.endDate),
  });
  const options = await getAttendanceRecapFilterOptions(organizationId);
  const defaultPeriod = monthPeriodOf(new Date(), options.timeZone);
  const startDate =
    parsed.success && parsed.data.startDate && parsed.data.endDate
      ? parsed.data.startDate
      : defaultPeriod.startDate;
  const endDate =
    parsed.success && parsed.data.startDate && parsed.data.endDate
      ? parsed.data.endDate
      : defaultPeriod.endDate;

  const detail = await getEmployeeAttendanceRecapDetail(
    organizationId,
    employeeId,
    { startDate, endDate }
  );
  if (!detail) forbidden();

  const { employee, summary, days } = detail;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Employee attendance recap
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {employee.employeeNumber} · {employee.employeeName}
          </p>
        </div>
        <Link
          href={`/attendance/recap?startDate=${startDate}&endDate=${endDate}`}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back to recap
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Period</CardTitle>
          <CardDescription>
            {formatDate(new Date(`${startDate}T00:00:00.000Z`))} –{" "}
            {formatDate(new Date(`${endDate}T00:00:00.000Z`))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-muted-foreground">Department</p>
              <p className="font-medium">{employee.department ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Position</p>
              <p className="font-medium">{employee.position ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Work location</p>
              <p className="font-medium">
                {employee.workLocationName ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Manager</p>
              <p className="font-medium">{employee.managerName ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Employment status</p>
              <p className="font-medium capitalize">
                {employee.employmentStatus}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Hire date</p>
              <p className="font-medium">
                {employee.hireDate ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Employment end date</p>
              <p className="font-medium">
                {employee.employmentEndDate ?? "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Attendance rate</p>
              <p>
                <AttendanceRateBadge rate={summary.attendanceRate} />
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(
          [
            ["Working days", summary.workingDays],
            ["Present", summary.present],
            ["Late", summary.late],
            ["Leave", summary.leave],
            ["Sick", summary.sick],
            ["Permission", summary.permission],
            ["Absent", summary.absent],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl border border-border bg-card p-4 shadow-sm"
          >
            <p className="truncate text-xs font-medium text-muted-foreground">
              {label}
            </p>
            <p className="mt-1 text-xl font-semibold tracking-tight">
              {value}
            </p>
          </div>
        ))}
      </div>

      {days.length === 0 ? (
        <EmptyState
          title="No attendance data found"
          description="No attendance data found for the selected period."
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Daily attendance</CardTitle>
            <CardDescription>
              One row per expected working day (Monday–Friday inside the
              employment window). Accepted attendance outside expected days
              is shown as “Extra” and is not counted in the summary.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Day</TableHead>
                    <TableHead>Check in</TableHead>
                    <TableHead>Check out</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Work location</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead className="text-right">Details</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {days.map((day) => (
                    <TableRow key={day.day}>
                      <TableCell className="font-mono text-xs">
                        {day.day}
                      </TableCell>
                      <TableCell>{weekdayLabel(day.day)}</TableCell>
                      <TableCell>
                        {formatTime(day.checkInAt, day.workLocationTimezone)}
                      </TableCell>
                      <TableCell>
                        {formatTime(day.checkOutAt, day.workLocationTimezone)}
                      </TableCell>
                      <TableCell>
                        <RecapDayStatusBadge
                          bucket={day.bucket}
                          late={day.late}
                        />
                      </TableCell>
                      <TableCell>
                        {day.workLocationName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <LocationStatusBadge
                          status={day.checkInLocationStatus}
                        />
                      </TableCell>
                      <TableCell>
                        <VerificationStatusBadge
                          status={day.checkInVerificationStatus}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        {day.attendanceId ? (
                          <Link
                            href={`/attendance/${day.attendanceId}`}
                            className={buttonVariants({
                              variant: "ghost",
                              size: "sm",
                            })}
                          >
                            Open
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
