/**
 * Dashboard recap math (features/dashboard/monthly-recap.ts).
 *
 * The "Ringkasan Kehadiran" card must agree with the Attendance Recap
 * module. These cases are the discrepancies found during the V2 QA run
 * (incomplete attendance, resignation, future leave, hire date) plus the
 * trend bucketing that used to throw on `Date` rows.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  buildAttendanceTrend,
  computeMonthlyRecap,
  dateColumnKey,
  eachDay,
  monthBounds,
  type MonthlyRecapInput,
} from "../../features/dashboard/monthly-recap.ts";

function input(overrides: Partial<MonthlyRecapInput> = {}): MonthlyRecapInput {
  return {
    monthKey: "2026-11",
    todayKey: "2026-11-10",
    hireDate: null,
    terminationDate: null,
    resignationDate: null,
    acceptedAttendanceDays: new Set(),
    leaveDays: new Map(),
    permissionDays: new Set(),
    ...overrides,
  };
}

describe("monthBounds / eachDay", () => {
  it("handles month lengths including leap February", () => {
    assert.deepEqual(monthBounds("2026-11"), { first: "2026-11-01", last: "2026-11-30" });
    assert.deepEqual(monthBounds("2028-02"), { first: "2028-02-01", last: "2028-02-29" });
  });
  it("lists inclusive calendar days", () => {
    assert.deepEqual(eachDay("2026-10-30", "2026-11-02"), [
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
  });
});

describe("computeMonthlyRecap — recap-module rules", () => {
  it("matches the recap for the QA employee in November (incomplete is not Hadir)", () => {
    // Nov 2 completed, Nov 3 incomplete (not accepted), Nov 5 leave,
    // Nov 6 permission, Nov 4 + Nov 9 nothing; today Nov 10 not over.
    const recap = computeMonthlyRecap(
      input({
        acceptedAttendanceDays: new Set(["2026-11-02"]),
        leaveDays: new Map([["2026-11-05", "ANNUAL"]]),
        permissionDays: new Set(["2026-11-06"]),
      })
    );
    assert.deepEqual(
      { hadir: recap.hadir, izin: recap.izin, cuti: recap.cuti, alpha: recap.alpha, workingDays: recap.workingDays },
      { hadir: 1, izin: 1, cuti: 1, alpha: 3, workingDays: 6 }
    );
    assert.equal(recap.percentage, 17); // recap module: 16.67%
  });

  it("never counts future days, so future approved leave does not inflate Cuti", () => {
    const recap = computeMonthlyRecap(
      input({ leaveDays: new Map([["2026-11-19", "ANNUAL"]]) })
    );
    assert.equal(recap.cuti, 0);
    assert.equal(recap.alpha, 6);
  });

  it("does not count today as Alpha before the day is over", () => {
    const recap = computeMonthlyRecap(input({ todayKey: "2026-11-02" }));
    assert.equal(recap.alpha, 0);
    assert.equal(recap.workingDays, 0);
  });

  it("counts today once attendance is recorded", () => {
    const recap = computeMonthlyRecap(
      input({ todayKey: "2026-11-02", acceptedAttendanceDays: new Set(["2026-11-02"]) })
    );
    assert.equal(recap.hadir, 1);
    assert.equal(recap.percentage, 100);
  });

  it("stops at the resignation date (both bounds inclusive)", () => {
    const recap = computeMonthlyRecap(
      input({
        monthKey: "2026-10",
        todayKey: "2026-11-10",
        hireDate: "2025-01-06",
        resignationDate: "2026-10-20",
        acceptedAttendanceDays: new Set(["2026-10-06"]),
      })
    );
    // Oct 1–20 has 14 weekdays: recap module shows 14 / present 1 / absent 13.
    assert.equal(recap.workingDays, 14);
    assert.equal(recap.hadir, 1);
    assert.equal(recap.alpha, 13);
  });

  it("uses the earlier of termination and resignation", () => {
    const recap = computeMonthlyRecap(
      input({ terminationDate: "2026-11-03", resignationDate: "2026-11-05" })
    );
    assert.equal(recap.workingDays, 2); // Nov 2, Nov 3
  });

  it("is empty for a month entirely after the employment end", () => {
    const recap = computeMonthlyRecap(input({ resignationDate: "2026-10-20" }));
    assert.equal(recap.workingDays, 0);
    assert.equal(recap.percentage, 0);
  });

  it("starts at the hire date", () => {
    const before = computeMonthlyRecap(input({ hireDate: "2026-11-16" }));
    assert.equal(before.workingDays, 0);
    const october = computeMonthlyRecap(
      input({
        monthKey: "2026-10",
        hireDate: "2026-10-15",
        acceptedAttendanceDays: new Set(["2026-10-16", "2026-10-19"]),
      })
    );
    assert.deepEqual([october.workingDays, october.hadir, october.alpha], [12, 2, 10]);
  });

  it("classifies sick leave as Cuti and prefers attendance over leave", () => {
    const recap = computeMonthlyRecap(
      input({
        acceptedAttendanceDays: new Set(["2026-11-02"]),
        leaveDays: new Map([
          ["2026-11-02", "ANNUAL"],
          ["2026-11-03", "SICK"],
        ]),
        permissionDays: new Set(["2026-11-03"]),
      })
    );
    assert.equal(recap.hadir, 1);
    assert.equal(recap.cuti, 1);
    assert.equal(recap.izin, 0);
  });

  it("ignores weekend attendance (recap counts it as 'extra')", () => {
    const recap = computeMonthlyRecap(
      input({ acceptedAttendanceDays: new Set(["2026-11-07", "2026-11-08"]) })
    );
    assert.equal(recap.hadir, 0);
    assert.equal(recap.workingDays, 6);
  });
});

describe("buildAttendanceTrend", () => {
  it("accepts drizzle Date values for date columns (used to throw RangeError)", () => {
    const trend = buildAttendanceTrend("2026-11-10", [
      { date: new Date("2026-11-04T00:00:00.000Z"), status: "completed", count: 3 },
      { date: new Date("2026-11-10T00:00:00.000Z"), status: "present", count: 2 },
      { date: "2026-11-10", status: "completed", count: 1 },
      { date: new Date("2026-11-01T00:00:00.000Z"), status: "present", count: 9 },
    ]);
    assert.equal(trend.length, 7);
    assert.equal(trend[0].date, "2026-11-04");
    assert.equal(trend[6].date, "2026-11-10");
    assert.equal(trend[0].completed, 3);
    assert.deepEqual([trend[6].present, trend[6].completed], [2, 1]);
    assert.ok(trend.every((point) => point.label.length > 0));
    assert.equal(trend.reduce((s, p) => s + p.present, 0), 2); // Nov 1 is outside
  });

  it("crosses month boundaries", () => {
    const trend = buildAttendanceTrend("2026-12-02", []);
    assert.deepEqual(
      trend.map((p) => p.date),
      ["2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]
    );
  });

  it("dateColumnKey normalizes Date and string values", () => {
    assert.equal(dateColumnKey(new Date("2026-11-02T00:00:00.000Z")), "2026-11-02");
    assert.equal(dateColumnKey("2026-11-02"), "2026-11-02");
  });
});

describe("navigation: new management entries match their page guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const nav = readFileSync(join(root, "components/layout/navigation.ts"), "utf8");
  const page = (p: string) => readFileSync(join(root, "app/(dashboard)", p, "page.tsx"), "utf8");
  const entry = (href: string) => {
    const at = nav.indexOf(`href: "${href}"`);
    assert.notEqual(at, -1, `${href} missing from navigation`);
    return nav.slice(at, nav.indexOf("}", at));
  };

  it("/attendance/management requires attendance.manage in both places", () => {
    assert.match(entry("/attendance/management"), /permission: PERMISSIONS\.ATTENDANCE_MANAGE/);
    assert.match(page("attendance/management"), /requirePermission\(user\.id, PERMISSIONS\.ATTENDANCE_MANAGE\)/);
  });

  it("/leave/management requires leave.approve OR leave.manage in both places", () => {
    const item = entry("/leave/management");
    assert.match(item, /anyPermission: \[PERMISSIONS\.LEAVE_APPROVE, PERMISSIONS\.LEAVE_MANAGE\]/);
    const guard = page("leave/management");
    assert.match(guard, /requireAnyPermission\(/);
    assert.match(guard, /PERMISSIONS\.LEAVE_APPROVE/);
    assert.match(guard, /PERMISSIONS\.LEAVE_MANAGE/);
  });

  it("/permission/management requires permission.approve OR permission.manage in both places", () => {
    const item = entry("/permission/management");
    assert.match(item, /PERMISSIONS\.PERMISSION_APPROVE/);
    assert.match(item, /PERMISSIONS\.PERMISSION_MANAGE/);
    assert.match(item, /anyPermission/);
    const guard = page("permission/management");
    assert.match(guard, /requireAnyPermission\(/);
    assert.match(guard, /PERMISSIONS\.PERMISSION_APPROVE/);
    assert.match(guard, /PERMISSIONS\.PERMISSION_MANAGE/);
  });

  it("the resolver keeps the role-based superadmin gate and adds OR-permissions", () => {
    const resolver = readFileSync(join(root, "components/layout/authorized-navigation.ts"), "utf8");
    assert.match(resolver, /import "server-only"/);
    assert.match(resolver, /!item\.superadminOnly \|\| authorization\.isSuperAdmin/);
    assert.match(resolver, /item\.anyPermission\.some\(\(code\) => granted\.has\(code\)\)/);
    assert.match(resolver, /if \(children\.length === 0\) return null;/);
  });
});
