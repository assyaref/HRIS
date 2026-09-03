/**
 * Attendance module constants (Phase 6).
 *
 * Raw status strings are centralized here and typed so they are never
 * scattered through the application. Values match the DB application-level
 * contracts documented in db/schema/attendance.ts.
 */

export const ATTENDANCE_STATUSES = [
  "present",
  "completed",
  "incomplete",
  "rejected",
] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LOCATION_STATUSES = [
  "valid",
  "outside_geofence",
  "unavailable",
  "denied",
] as const;
export type AttendanceLocationStatus =
  (typeof ATTENDANCE_LOCATION_STATUSES)[number];

export const ATTENDANCE_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "failed",
  "unavailable",
] as const;
export type AttendanceVerificationStatus =
  (typeof ATTENDANCE_VERIFICATION_STATUSES)[number];

export const ATTENDANCE_METHODS = ["face", "camera", "manual"] as const;
export type AttendanceMethod = (typeof ATTENDANCE_METHODS)[number];

export const ATTENDANCE_EVENT_TYPES = [
  "check_in_attempt",
  "check_in_success",
  "check_in_rejected",
  "check_out_attempt",
  "check_out_success",
  "check_out_rejected",
  "verification_failed",
  "location_rejected",
] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

/**
 * Presentation states shown to an employee for "today".
 * NOT_CHECKED_IN | CHECKED_IN | CHECKED_OUT | REJECTED | UNAVAILABLE
 */
export const EMPLOYEE_ATTENDANCE_STATES = [
  "NOT_CHECKED_IN",
  "CHECKED_IN",
  "CHECKED_OUT",
  "REJECTED",
  "UNAVAILABLE",
] as const;
export type EmployeeAttendanceState =
  (typeof EMPLOYEE_ATTENDANCE_STATES)[number];

export const EMPLOYEE_ATTENDANCE_STATE_LABELS: Record<
  EmployeeAttendanceState,
  string
> = {
  NOT_CHECKED_IN: "Not checked in",
  CHECKED_IN: "Checked in",
  CHECKED_OUT: "Checked out",
  REJECTED: "Rejected",
  UNAVAILABLE: "Unavailable",
};

export const ATTENDANCE_STATUS_LABELS: Record<AttendanceStatus, string> = {
  present: "Present",
  completed: "Completed",
  incomplete: "Incomplete",
  rejected: "Rejected",
};

export const ATTENDANCE_LOCATION_STATUS_LABELS: Record<
  AttendanceLocationStatus,
  string
> = {
  valid: "Valid",
  outside_geofence: "Outside geofence",
  unavailable: "Unavailable",
  denied: "Denied",
};

export const ATTENDANCE_VERIFICATION_STATUS_LABELS: Record<
  AttendanceVerificationStatus,
  string
> = {
  pending: "Pending",
  verified: "Verified",
  failed: "Failed",
  unavailable: "Unavailable",
};
