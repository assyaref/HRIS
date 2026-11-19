import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  daysBetween,
  evaluateDay,
  evaluateEmployee,
  localInstant,
  type EmployeeScheduleInput,
} from "../../features/time/schedule.ts";
import { parseScheduleParams } from "../../features/time/schedule-params.ts";

const TZ = "Asia/Jakarta";
const at = (day: string, hhmm: string) => localInstant(day, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)), TZ);

function input(overrides: Partial<EmployeeScheduleInput> = {}): EmployeeScheduleInput {
  return {
    shift: { startTime: "08:00", endTime: "17:00", workingDays: [1, 2, 3, 4, 5] },
    days: daysBetween("2026-11-16", "2026-11-22"), // Mon … Sun
    today: "2026-11-30",
    hireDate: null,
    endDate: null,
    holidays: new Set(),
    attendance: new Map(),
    leaveDays: new Set(),
    permissionDays: new Set(),
    graceMinutes: 5,
    ...overrides,
  };
}

describe("shift-aware attendance", () => {
  it("converts local shift times to instants", () => {
    assert.equal(at("2026-11-16", "08:00").toISOString(), "2026-11-16T01:00:00.000Z");
    assert.equal(localInstant("2026-07-01", 8 * 60, "Europe/Berlin").toISOString(), "2026-07-01T06:00:00.000Z");
    assert.equal(localInstant("2026-01-15", 8 * 60, "Europe/Berlin").toISOString(), "2026-01-15T07:00:00.000Z");
  });

  it("measures late arrival after the grace period and early leave", () => {
    const attendance = new Map([
      ["2026-11-16", { day: "2026-11-16", checkInAt: at("2026-11-16", "08:04"), checkOutAt: at("2026-11-16", "17:10"), timeZone: TZ }],
      ["2026-11-17", { day: "2026-11-17", checkInAt: at("2026-11-17", "08:20"), checkOutAt: at("2026-11-17", "16:30"), timeZone: TZ }],
      ["2026-11-18", { day: "2026-11-18", checkInAt: at("2026-11-18", "07:50"), checkOutAt: null, timeZone: TZ }],
    ]);
    const i = input({ attendance });
    assert.deepEqual(
      { ...evaluateDay(i, "2026-11-16") },
      { day: "2026-11-16", kind: "present", lateMinutes: 0, earlyMinutes: 0, extra: false, missingCheckOut: false }
    );
    const tue = evaluateDay(i, "2026-11-17");
    assert.equal(tue.lateMinutes, 20);
    assert.equal(tue.earlyMinutes, 30);
    assert.equal(evaluateDay(i, "2026-11-18").missingCheckOut, true);
  });

  it("classifies leave, permission, holiday, weekend, absence and future days", () => {
    const i = input({
      holidays: new Set(["2026-11-20"]),
      leaveDays: new Set(["2026-11-17"]),
      permissionDays: new Set(["2026-11-18"]),
      attendance: new Map([["2026-11-21", { day: "2026-11-21", checkInAt: at("2026-11-21", "09:00"), checkOutAt: null, timeZone: TZ }]]),
      today: "2026-11-19",
    });
    const kinds = i.days.map((d) => evaluateDay(i, d).kind);
    assert.deepEqual(kinds, ["absent", "leave", "permission", "upcoming", "holiday", "off", "off"]);
    assert.equal(evaluateDay(i, "2026-11-21").extra, true);
  });

  it("handles a night shift ending the next day", () => {
    const i = input({
      shift: { startTime: "22:00", endTime: "06:00", workingDays: [1, 2, 3, 4, 5] },
      attendance: new Map([
        ["2026-11-16", { day: "2026-11-16", checkInAt: at("2026-11-16", "22:15"), checkOutAt: at("2026-11-17", "05:30"), timeZone: TZ }],
      ]),
    });
    const day = evaluateDay(i, "2026-11-16");
    assert.equal(day.lateMinutes, 15);
    assert.equal(day.earlyMinutes, 30);
  });

  it("ignores days outside the employment window", () => {
    const i = input({ hireDate: "2026-11-18", endDate: "2026-11-19", today: "2026-11-30" });
    const { summary } = evaluateEmployee(i);
    assert.equal(summary.scheduled, 2);
    assert.equal(summary.absent, 2);
    assert.equal(summary.attendanceRate, 0);
  });

  it("summarizes rates", () => {
    const attendance = new Map(
      ["2026-11-16", "2026-11-17", "2026-11-18"].map((d, n) => [
        d,
        { day: d, checkInAt: at(d, n === 0 ? "08:30" : "07:55"), checkOutAt: at(d, "17:00"), timeZone: TZ },
      ])
    );
    const { summary } = evaluateEmployee(input({ attendance, leaveDays: new Set(["2026-11-19"]) }));
    assert.equal(summary.scheduled, 5);
    assert.equal(summary.present, 3);
    assert.equal(summary.leave, 1);
    assert.equal(summary.absent, 1);
    assert.equal(summary.late, 1);
    assert.equal(summary.lateMinutes, 30);
    assert.equal(summary.attendanceRate, 60);
    assert.equal(summary.punctualityRate, 66.7);
  });
});

describe("schedule report params", () => {
  it("defaults to the current month and caps long periods", () => {
    assert.deepEqual(parseScheduleParams({}, "2026-11-19"), { from: "2026-11-01", to: "2026-11-30", graceMinutes: 5, groupId: undefined });
    assert.equal(parseScheduleParams({ month: "2026-02" }, "2026-11-19").to, "2026-02-28");
    assert.equal(parseScheduleParams({ from: "2026-01-01", to: "2026-12-31" }, "2026-11-19").to, "2026-03-03");
    assert.equal(parseScheduleParams({ from: "2026-05-10", to: "2026-05-01" }, "2026-11-19").from, "2026-11-01");
    assert.equal(parseScheduleParams({ grace: "500" }, "2026-11-19").graceMinutes, 120);
    assert.equal(parseScheduleParams({ group: "x" }, "2026-11-19").groupId, undefined);
  });
});

describe("schedule report guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("page, nav and export all require attendance.manage", () => {
    const page = read("app/(dashboard)/time/schedule-report/page.tsx");
    assert.match(page, /requirePermission\(user\.id, PERMISSIONS\.ATTENDANCE_MANAGE\)/);
    assert.match(page, /isTimeModuleReady\(\)/);
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/time/schedule-report"');
    assert.match(nav.slice(at, nav.indexOf("}", at)), /permission: PERMISSIONS\.ATTENDANCE_MANAGE/);
    const route = read("app/api/reports/export/route.ts");
    assert.match(route, /schedule: \[PERMISSIONS\.ATTENDANCE_MANAGE\]/);
    assert.match(route, /report === "schedule"[\s\S]*?isTimeModuleReady\(\)/);
  });
});
