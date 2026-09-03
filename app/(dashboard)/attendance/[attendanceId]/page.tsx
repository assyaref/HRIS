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
import {
  hasPermission,
  requirePermission,
} from "@/lib/auth/rbac";

import {
  AttendanceStatusBadge,
  LocationStatusBadge,
  VerificationStatusBadge,
} from "@/features/attendance/attendance-badges";
import {
  formatDate,
  formatDateTime,
  formatTime,
} from "@/features/attendance/format";
import { getAttendanceDetail } from "@/features/attendance/queries";

export const metadata: Metadata = {
  title: "Attendance details",
};

/**
 * Attendance detail (employee self-view or management).
 *
 * Organization scoped: a cross-organization attendance id renders forbidden.
 * A plain EMPLOYEE may only open their OWN attendance record; management roles
 * may open any record in the organization. No credentials are ever shown.
 */
export default async function AttendanceDetailPage({
  params,
}: {
  params: Promise<{ attendanceId: string }>;
}) {
  const { attendanceId } = await params;
  const user = await requireUser();
  await requirePermission(user.id, PERMISSIONS.ATTENDANCE_VIEW);
  if (!user.organizationId) forbidden();
  const organizationId = user.organizationId;

  const detail = await getAttendanceDetail(organizationId, attendanceId);
  if (!detail) forbidden();

  const isManager = await hasPermission(
    user.id,
    PERMISSIONS.ATTENDANCE_MANAGE
  );
  if (!isManager && detail.employeeUserId !== user.id) {
    // Employees must not view other employees' attendance.
    forbidden();
  }

  const record = detail.attendance;
  const timeZone = record.workLocationTimezone;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Attendance details
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">
            {record.employeeName} · {record.employeeNumber}
          </p>
        </div>
        <Link
          href={isManager ? "/attendance/management" : "/attendance"}
          className={buttonVariants({ variant: "outline", size: "sm" })}
        >
          Back
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            {formatDate(record.attendanceDate)}
            <AttendanceStatusBadge status={record.status} />
          </CardTitle>
          <CardDescription>
            {record.projectName ?? "No project"} /{" "}
            {record.workLocationName ?? "No work location"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 text-sm">
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Check-in</p>
              <p className="font-medium">
                {record.checkInAt
                  ? formatDateTime(record.checkInAt, timeZone)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out</p>
              <p className="font-medium">
                {record.checkOutAt
                  ? formatDateTime(record.checkOutAt, timeZone)
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p>
                <AttendanceStatusBadge status={record.status} />
              </p>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Check-in location</p>
              <p>
                <LocationStatusBadge status={record.checkInLocationStatus} />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-in distance</p>
              <p className="font-medium">
                {record.checkInDistanceMeters !== null
                  ? `${Math.round(record.checkInDistanceMeters)} m`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-in accuracy</p>
              <p className="font-medium">
                {record.checkInAccuracyMeters !== null
                  ? `±${Math.round(record.checkInAccuracyMeters)} m`
                  : "—"}
              </p>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Check-in verification</p>
              <p>
                <VerificationStatusBadge
                  status={record.checkInVerificationStatus}
                />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out verification</p>
              <p>
                <VerificationStatusBadge
                  status={record.checkOutVerificationStatus}
                />
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out location</p>
              <p>
                <LocationStatusBadge status={record.checkOutLocationStatus} />
              </p>
            </div>
          </div>

          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Check-out distance</p>
              <p className="font-medium">
                {record.checkOutDistanceMeters !== null
                  ? `${Math.round(record.checkOutDistanceMeters)} m`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out accuracy</p>
              <p className="font-medium">
                {record.checkOutAccuracyMeters !== null
                  ? `±${Math.round(record.checkOutAccuracyMeters)} m`
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Check-out time</p>
              <p className="font-medium">
                {formatTime(record.checkOutAt, timeZone)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Event history</CardTitle>
          <CardDescription>
            Immutable attendance events. This log is append-only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detail.events.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No events recorded.
            </p>
          ) : (
            <div className="rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Reason</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detail.events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-xs">
                        {event.eventType}
                      </TableCell>
                      <TableCell>
                        {formatDateTime(event.eventAt, timeZone)}
                      </TableCell>
                      <TableCell>
                        {event.verificationMethod ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {event.reason ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
