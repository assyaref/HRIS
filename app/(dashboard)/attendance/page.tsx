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
import { hasPermission, requirePermission } from "@/lib/auth/rbac";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";

import { AttendancePanel } from "@/features/attendance/attendance-panel";
import { AttendanceStatusBadge } from "@/features/attendance/attendance-badges";
import {
  EMPLOYEE_ATTENDANCE_STATE_LABELS,
  type EmployeeAttendanceState,
} from "@/features/attendance/constants";
import { formatDate, formatTime } from "@/features/attendance/format";
import {
  findAttendanceForDate,
  findOpenAttendance,
  getEmployeeForUser,
  listEligibleAttendanceOptions,
  listMyAttendanceHistory,
} from "@/features/attendance/queries";

export const metadata: Metadata = {
  title: "Attendance",
};

/**
 * Employee attendance self-service page.
 *
 * The employee is resolved from the authenticated user's linked employee
 * record — never from a client-supplied id. All business actions happen in
 * the server actions; this page renders current state and history.
 */
export default async function AttendancePage() {
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const employee = await getEmployeeForUser(user.id, organizationId);
  if (!employee) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Attendance
        </h1>
        <EmptyState
          title="No employee profile linked"
          description="Your account is not linked to an employee record, so attendance is unavailable. Contact your administrator."
        />
      </div>
    );
  }

  const employeeActive = employee.employmentStatus === "active";
  const [openAttendance, todayRecord, options, history, canCheckIn, canCheckOut] =
    await Promise.all([
      findOpenAttendance(organizationId, employee.id),
      findAttendanceForDate(
        organizationId,
        employee.id,
        parseAttendanceDate(dateStringInTimeZone(new Date(), null))
      ),
      listEligibleAttendanceOptions(organizationId, employee.id),
      listMyAttendanceHistory(organizationId, employee.id, 1),
      hasPermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_IN),
      hasPermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_OUT),
    ]);

  let state: EmployeeAttendanceState;
  if (!employeeActive) {
    state = "UNAVAILABLE";
  } else if (openAttendance) {
    state = "CHECKED_IN";
  } else if (todayRecord) {
    state = "CHECKED_OUT";
  } else {
    state = "NOT_CHECKED_IN";
  }

  const stateLabel = EMPLOYEE_ATTENDANCE_STATE_LABELS[state];
  const activeRecord = openAttendance ?? todayRecord;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          Attendance
        </h1>
        <p className="mt-1 text-sm text-muted-foreground sm:text-base">
          {employee.firstName} {employee.lastName} · {employee.employeeNumber}
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Today&apos;s status</CardTitle>
          <CardDescription>{stateLabel}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state === "UNAVAILABLE" ? (
            <p className="text-sm text-muted-foreground">
              Your employee profile is inactive. Contact your administrator.
            </p>
          ) : null}

          {activeRecord ? (
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Check-in</dt>
                <dd className="font-medium">
                  {formatTime(
                    activeRecord.checkInAt,
                    activeRecord.workLocationTimezone
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Location</dt>
                <dd className="font-medium">
                  {activeRecord.projectName ?? "—"} /{" "}
                  {activeRecord.workLocationName ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Distance</dt>
                <dd className="font-medium">
                  {activeRecord.checkInDistanceMeters !== null
                    ? `${Math.round(activeRecord.checkInDistanceMeters)} m`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <AttendanceStatusBadge status={activeRecord.status} />
                </dd>
              </div>
            </dl>
          ) : null}
        </CardContent>
      </Card>

      {state === "CHECKED_IN" && canCheckOut ? (
        <AttendancePanel mode="check_out" options={[]} />
      ) : null}

      {state === "NOT_CHECKED_IN" && canCheckIn ? (
        options.length > 0 ? (
          <AttendancePanel mode="check_in" options={options} />
        ) : (
          <EmptyState
            title="No eligible work location"
            description="You do not have an active project assignment with a work location. Contact your administrator."
          />
        )
      ) : null}

      {state === "CHECKED_OUT" ? (
        <p className="text-sm text-muted-foreground">
          You have already completed today&apos;s attendance.
        </p>
      ) : null}

      {state === "NOT_CHECKED_IN" && !canCheckIn ? (
        <p className="text-sm text-muted-foreground">
          You do not have permission to check in.
        </p>
      ) : null}

      <section aria-labelledby="attendance-history-heading">
        <h2
          id="attendance-history-heading"
          className="mb-3 text-sm font-semibold tracking-wide text-muted-foreground uppercase"
        >
          Attendance history
        </h2>
        {history.items.length === 0 ? (
          <EmptyState
            title="No attendance yet"
            description="Your attendance records will appear here."
          />
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Check in</TableHead>
                  <TableHead>Check out</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.items.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell>{formatDate(record.attendanceDate)}</TableCell>
                    <TableCell>
                      {formatTime(
                        record.checkInAt,
                        record.workLocationTimezone
                      )}
                    </TableCell>
                    <TableCell>
                      {formatTime(
                        record.checkOutAt,
                        record.workLocationTimezone
                      )}
                    </TableCell>
                    <TableCell>
                      <AttendanceStatusBadge status={record.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/attendance/${record.id}`}
                        className={buttonVariants({
                          variant: "ghost",
                          size: "sm",
                        })}
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    </div>
  );
}
