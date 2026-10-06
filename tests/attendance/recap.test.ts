/**
 * Attendance Recap — pure engine tests (node:test).
 *
 * Exercises `features/attendance/recap.ts`: working-day derivation,
 * employment-window clipping (hire / termination), day classification
 * precedence, late detection, sick-leave classification, the attendance
 * rate formula and the rate indicator bands. No DB, no server-only imports.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  attendanceRateIndicator,
  classifyRecapDay,
  computeAttendanceRate,
  countLateCheckIns,
  employmentWindow,
  formatAttendanceRate,
  isLateCheckIn,
  isSickLeaveTypeCode,
  isoDayOfDateString,
  listWorkingDays,
  monthPeriodOf,
  summarizeRecapDays,
  type RecapDayFact,
} from "../../features/attendance/recap.ts";

function fact(
  day: string,
  overrides: Partial<RecapDayFact> = {}
): RecapDayFact {
  return {
    day,
    isoDay: isoDayOfDateString(day),
    inEmploymentWindow: true,
    attendanceAccepted: false,
    hasApprovedLeave: false,
    leaveTypeCode: null,
    hasApprovedPermission: false,
    ...overrides,
  };
}

describe("attendance rate", () => {
  it("computes present/expected × 100 rounded to 2 decimals", () => {
    assert.equal(computeAttendanceRate(20, 22), 90.91);
  });

  it("returns null when there are no expected working days", () => {
    assert.equal(computeAttendanceRate(0, 0), null);
  });

  it("formats the rate for display", () => {
    assert.equal(formatAttendanceRate(90.91), "90.91%");
    assert.equal(formatAttendanceRate(null), "—");
  });
});

describe("rate indicator bands", () => {
  it(">= 95 is normal", () => {
    assert.equal(attendanceRateIndicator(95), "normal");
    assert.equal(attendanceRateIndicator(100), "normal");
  });

  it("90–94.99 is attention", () => {
    assert.equal(attendanceRateIndicator(94.99), "attention");
    assert.equal(attendanceRateIndicator(90), "attention");
  });

  it("< 90 is warning", () => {
    assert.equal(attendanceRateIndicator(89.99), "warning");
    assert.equal(attendanceRateIndicator(0), "warning");
  });
});

describe("working days (Mon–Fri)", () => {
  it("lists only Monday–Friday days in the period", () => {
    const days = listWorkingDays(
      "2026-10-01",
      "2026-10-31",
      employmentWindow({
        hireDate: null,
        terminationDate: null,
        resignationDate: null,
      })
    );
    assert.equal(days.length, 22);
    assert.equal(days[0], "2026-10-01"); // Thursday
    assert.equal(days.at(-1), "2026-10-30"); // Friday
    // No weekend days.
    for (const day of days) {
      const iso = isoDayOfDateString(day);
      assert.ok(iso >= 1 && iso <= 5, `${day} must be a weekday`);
    }
  });
});

describe("employment window clipping", () => {
  it("does not count days before the hire date as working days", () => {
    const days = listWorkingDays(
      "2026-10-01",
      "2026-10-31",
      employmentWindow({
        hireDate: "2026-10-15",
        terminationDate: null,
        resignationDate: null,
      })
    );
    assert.ok(days.every((day) => day >= "2026-10-15"));
    assert.equal(days[0], "2026-10-15");
  });

  it("does not count days after termination as working days", () => {
    const days = listWorkingDays(
      "2026-10-01",
      "2026-10-31",
      employmentWindow({
        hireDate: null,
        terminationDate: "2026-10-20",
        resignationDate: null,
      })
    );
    assert.ok(days.every((day) => day <= "2026-10-20"));
    assert.equal(days.at(-1), "2026-10-20");
  });

  it("uses the earlier of termination/resignation, both inclusive", () => {
    const window = employmentWindow({
      hireDate: "2026-10-01",
      terminationDate: "2026-10-25",
      resignationDate: "2026-10-20",
    });
    assert.equal(window.start, "2026-10-01");
    assert.equal(window.end, "2026-10-20");
  });

  it("a full-period employee summarized with a pre-hire fact is unaffected", () => {
    const days = listWorkingDays(
      "2026-10-01",
      "2026-10-31",
      employmentWindow({
        hireDate: "2026-10-15",
        terminationDate: null,
        resignationDate: null,
      })
    );
    const facts = days.map((day) => fact(day, { attendanceAccepted: true }));
    // Include facts for days before the hire date: they must not enter the
    // counters (neither working days nor absent).
    const preHire = fact("2026-10-01", { inEmploymentWindow: false });
    const summary = summarizeRecapDays([preHire, ...facts]);
    assert.equal(summary.workingDays, days.length);
    assert.equal(summary.present, days.length);
    assert.equal(summary.absent, 0);
  });
});

describe("day classification", () => {
  it("prefers accepted attendance over approved leave", () => {
    assert.equal(
      classifyRecapDay(
        fact("2026-10-01", {
          attendanceAccepted: true,
          hasApprovedLeave: true,
          leaveTypeCode: "annual",
        })
      ),
      "present"
    );
  });

  it("classifies approved sick-type leave as sick", () => {
    assert.equal(
      classifyRecapDay(
        fact("2026-10-01", {
          hasApprovedLeave: true,
          leaveTypeCode: "sick",
        })
      ),
      "sick"
    );
  });

  it("classifies other approved leave as leave", () => {
    assert.equal(
      classifyRecapDay(
        fact("2026-10-01", {
          hasApprovedLeave: true,
          leaveTypeCode: "annual",
        })
      ),
      "leave"
    );
  });

  it("classifies approved permission as permission", () => {
    assert.equal(
      classifyRecapDay(
        fact("2026-10-01", { hasApprovedPermission: true })
      ),
      "permission"
    );
  });

  it("classifies an expected day with nothing as absent", () => {
    assert.equal(classifyRecapDay(fact("2026-10-01")), "absent");
  });

  it("weekend with attendance is extra, without attendance is none", () => {
    assert.equal(
      classifyRecapDay(
        fact("2026-10-03", { attendanceAccepted: true }) // Saturday
      ),
      "extra"
    );
    assert.equal(classifyRecapDay(fact("2026-10-03")), "none");
  });
});

describe("sick leave type detection", () => {
  it("matches sick/sakit/medical case-insensitively", () => {
    assert.equal(isSickLeaveTypeCode("sick"), true);
    assert.equal(isSickLeaveTypeCode("SICK"), true);
    assert.equal(isSickLeaveTypeCode("sakit"), true);
    assert.equal(isSickLeaveTypeCode("Medical Leave"), true);
    assert.equal(isSickLeaveTypeCode("annual"), false);
    assert.equal(isSickLeaveTypeCode(null), false);
  });
});

describe("late detection (check-in after 08:00 local work-location time)", () => {
  it("08:01 WIB is late, 08:00 WIB is not, 07:59 WIB is not", () => {
    const zone = "Asia/Jakarta";
    assert.equal(
      isLateCheckIn({ checkInAt: new Date("2026-10-01T01:01:00.000Z"), timeZone: zone }),
      true
    );
    assert.equal(
      isLateCheckIn({ checkInAt: new Date("2026-10-01T01:00:00.000Z"), timeZone: zone }),
      false
    );
    assert.equal(
      isLateCheckIn({ checkInAt: new Date("2026-10-01T00:59:00.000Z"), timeZone: zone }),
      false
    );
  });

  it("falls back to UTC when the timezone is missing or invalid", () => {
    assert.equal(
      isLateCheckIn({ checkInAt: new Date("2026-10-01T08:01:00.000Z"), timeZone: null }),
      true
    );
    assert.equal(
      isLateCheckIn({
        checkInAt: new Date("2026-10-01T08:01:00.000Z"),
        timeZone: "Not/AZone",
      }),
      true
    );
  });

  it("counts late check-ins", () => {
    assert.equal(
      countLateCheckIns([
        { checkInAt: new Date("2026-10-01T01:00:00.000Z"), timeZone: "Asia/Jakarta" },
        { checkInAt: new Date("2026-10-02T01:30:00.000Z"), timeZone: "Asia/Jakarta" },
      ]),
      1
    );
  });
});

describe("period summary", () => {
  it("aggregates a realistic month (22 working days, 20 present, 1 leave, 1 absent)", () => {
    const days = listWorkingDays(
      "2026-10-01",
      "2026-10-31",
      employmentWindow({
        hireDate: "2026-10-01",
        terminationDate: null,
        resignationDate: null,
      })
    );
    assert.equal(days.length, 22);
    const present = days.slice(0, 20).map((day) => fact(day, { attendanceAccepted: true }));
    const summary = summarizeRecapDays([
      ...present,
      fact(days[20], { hasApprovedLeave: true, leaveTypeCode: "annual" }),
      fact(days[21]),
    ]);
    assert.equal(summary.workingDays, 22);
    assert.equal(summary.present, 20);
    assert.equal(summary.leave, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.attendanceRate, 90.91);
  });
});

describe("default period", () => {
  it("monthPeriodOf returns the calendar month containing the reference date", () => {
    const period = monthPeriodOf(
      new Date("2026-10-05T12:00:00.000Z"),
      "Asia/Jakarta"
    );
    assert.equal(period.startDate, "2026-10-01");
    assert.equal(period.endDate, "2026-10-31");
  });

  it("handles February in a leap year", () => {
    const period = monthPeriodOf(new Date("2024-02-10T00:00:00.000Z"), "UTC");
    assert.equal(period.startDate, "2024-02-01");
    assert.equal(period.endDate, "2024-02-29");
  });
});
