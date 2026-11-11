"use server";

import { requireUser } from "@/lib/auth/auth";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/rbac";
import {
  dateStringInTimeZone,
  parseAttendanceDate,
} from "@/lib/attendance/time";

import { formatTime } from "./format";
import {
  findAttendanceForDate,
  findOpenAttendance,
  getEmployeeForUser,
  listEligibleAttendanceOptions,
  type AttendanceOption,
} from "./queries";

/** Today's attendance situation for the signed-in employee (sheet header). */
export type AttendanceSheetState =
  | "NOT_CHECKED_IN"
  | "CHECKED_IN"
  | "CHECKED_OUT"
  | "REJECTED"
  | "UNAVAILABLE";

export type AttendanceSheetData =
  | {
      ok: true;
      state: AttendanceSheetState;
      canCheckIn: boolean;
      canCheckOut: boolean;
      /** Eligible project / work-location pairs (check-in). */
      options: AttendanceOption[];
      /** Work location of the open record (check-out), when any. */
      openLocationName: string | null;
      checkInLabel: string | null;
      checkOutLabel: string | null;
    }
  | { ok: false; message: string };

/**
 * Loads what the face-attendance sheet needs to render, for the authenticated
 * user only. Read-only: it mirrors the state derivation of the attendance
 * page so the sheet and the page can never disagree about whether the next
 * step is a check-in or a check-out. The employee is resolved from the
 * session — no client-supplied identifiers are accepted.
 */
export async function loadAttendanceSheetAction(): Promise<AttendanceSheetData> {
  const user = await requireUser();
  if (!user.organizationId) {
    return { ok: false, message: "Akun Anda belum memiliki organisasi." };
  }
  const organizationId = user.organizationId;

  const [canView, canCheckIn, canCheckOut] = await Promise.all([
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_VIEW),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_IN),
    hasPermission(user.id, PERMISSIONS.ATTENDANCE_CHECK_OUT),
  ]);
  if (!canView) {
    return {
      ok: false,
      message:
        "Presensi belum tersedia untuk akun Anda. Hubungi administrator atau HR.",
    };
  }

  const employee = await getEmployeeForUser(user.id, organizationId);
  if (!employee) {
    return {
      ok: false,
      message:
        "Akun Anda belum ditautkan ke data karyawan. Hubungi administrator.",
    };
  }

  const [openAttendance, todayRecord, options] = await Promise.all([
    findOpenAttendance(organizationId, employee.id),
    findAttendanceForDate(
      organizationId,
      employee.id,
      parseAttendanceDate(dateStringInTimeZone(new Date(), null))
    ),
    listEligibleAttendanceOptions(organizationId, employee.id),
  ]);

  let state: AttendanceSheetState;
  if (employee.employmentStatus !== "active") {
    state = "UNAVAILABLE";
  } else if (openAttendance) {
    state = "CHECKED_IN";
  } else if (todayRecord?.checkOutAt) {
    state = "CHECKED_OUT";
  } else if (todayRecord && todayRecord.status === "rejected") {
    state = "REJECTED";
  } else if (todayRecord) {
    state = "CHECKED_OUT";
  } else {
    state = "NOT_CHECKED_IN";
  }

  const activeRecord = openAttendance ?? todayRecord;
  const timeZone = activeRecord?.workLocationTimezone ?? null;

  return {
    ok: true,
    state,
    canCheckIn,
    canCheckOut,
    options,
    openLocationName: openAttendance?.workLocationName ?? null,
    checkInLabel: activeRecord?.checkInAt
      ? formatTime(activeRecord.checkInAt, timeZone)
      : null,
    checkOutLabel: todayRecord?.checkOutAt
      ? formatTime(todayRecord.checkOutAt, timeZone)
      : null,
  };
}
