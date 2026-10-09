/**
 * Attendance panel submit-state tests (node:test, pure).
 *
 * Regression guard for the ABSEN flow: the Check-out panel is rendered with no
 * project/work-location options (`options={[]}` on the attendance page), so a
 * submit rule that requires a selected option would permanently disable
 * Check-out. These tests pin the mode-specific requirements:
 *   - check_in  : location + option + photo
 *   - check_out : location only
 *   - both      : blocked while disabled/pending (double-submit guard)
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  ATTENDANCE_PANEL_MODES,
  isAttendanceSubmitEnabled,
  type AttendanceSubmitState,
} from "../../features/attendance/panel-state.ts";

const base: AttendanceSubmitState = {
  mode: "check_in",
  disabled: false,
  pending: false,
  hasLocation: true,
  hasCurrentOption: true,
  hasPhoto: true,
};

describe("isAttendanceSubmitEnabled — check_in", () => {
  it("enables check-in only with location, option and photo", () => {
    assert.equal(isAttendanceSubmitEnabled(base), true);
  });

  it("requires a selected work location", () => {
    assert.equal(
      isAttendanceSubmitEnabled({ ...base, hasCurrentOption: false }),
      false
    );
  });

  it("requires a presence photo", () => {
    assert.equal(isAttendanceSubmitEnabled({ ...base, hasPhoto: false }), false);
  });

  it("requires a GPS fix", () => {
    assert.equal(isAttendanceSubmitEnabled({ ...base, hasLocation: false }), false);
  });
});

describe("isAttendanceSubmitEnabled — check_out", () => {
  const checkout: AttendanceSubmitState = { ...base, mode: "check_out" };

  it("enables check-out with a GPS fix and no options/photo", () => {
    assert.equal(
      isAttendanceSubmitEnabled({
        ...checkout,
        hasCurrentOption: false,
        hasPhoto: false,
      }),
      true
    );
  });

  it("still requires a GPS fix", () => {
    assert.equal(
      isAttendanceSubmitEnabled({
        ...checkout,
        hasCurrentOption: false,
        hasPhoto: false,
        hasLocation: false,
      }),
      false
    );
  });

  it("regression: empty options must NOT disable check-out", () => {
    // This is the exact shape produced by the attendance page:
    // <AttendancePanel mode="check_out" options={[]} />
    assert.equal(
      isAttendanceSubmitEnabled({
        mode: "check_out",
        disabled: false,
        pending: false,
        hasLocation: true,
        hasCurrentOption: false,
        hasPhoto: false,
      }),
      true
    );
  });
});

describe("isAttendanceSubmitEnabled — guards", () => {
  for (const mode of ATTENDANCE_PANEL_MODES) {
    it(`blocks ${mode} while disabled (no permission / inactive employee)`, () => {
      assert.equal(
        isAttendanceSubmitEnabled({
          ...base,
          mode,
          disabled: true,
        }),
        false
      );
    });

    it(`blocks ${mode} while a request is already pending (double-click)`, () => {
      assert.equal(
        isAttendanceSubmitEnabled({
          ...base,
          mode,
          pending: true,
        }),
        false
      );
    });
  }

  it("is deterministic for identical input", () => {
    assert.equal(
      isAttendanceSubmitEnabled({ ...base }),
      isAttendanceSubmitEnabled({ ...base })
    );
  });
});
