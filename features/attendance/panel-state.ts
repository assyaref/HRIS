/**
 * Attendance panel submit-state (pure, testable).
 *
 * The interactive Check-in / Check-out panel is a client leaf. This module
 * owns the single rule that decides whether its submit control is enabled, so
 * the rule is unit-testable without a browser and cannot drift between the two
 * modes.
 *
 * Check-in MUST select an eligible project/work location and capture a
 * presence photo. Check-out operates on the employee's already-open record, so
 * it MUST NOT require a project/work-location selection or a photo — only a
 * fresh GPS fix. Treating check-out like check-in (requiring a location
 * option that is never provided) permanently disables the Check-out button.
 */

export const ATTENDANCE_PANEL_MODES = ["check_in", "check_out"] as const;
export type AttendancePanelMode = (typeof ATTENDANCE_PANEL_MODES)[number];

export interface AttendanceSubmitState {
  mode: AttendancePanelMode;
  /** Panel-level disable (missing permission, inactive employee, …). */
  disabled: boolean;
  /** A request is already in flight (double-click guard). */
  pending: boolean;
  /** A GPS fix has been obtained or an explicit location issue was recorded. */
  hasLocation: boolean;
  /** A project/work-location option is selected (check-in only). */
  hasCurrentOption: boolean;
  /** A presence photo has been captured (check-in only). */
  hasPhoto: boolean;
}

/** Whether the panel's primary submit control may be pressed. */
export function isAttendanceSubmitEnabled(
  state: AttendanceSubmitState
): boolean {
  if (state.disabled || state.pending || !state.hasLocation) {
    return false;
  }
  if (state.mode === "check_in") {
    return state.hasCurrentOption && state.hasPhoto;
  }
  return true;
}
