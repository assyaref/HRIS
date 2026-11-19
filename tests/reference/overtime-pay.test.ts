import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  overtimeNote,
  overtimePay,
  weightedHours,
  withOvertimeAmount,
} from "../../features/time/overtime-pay.ts";

describe("overtime pay (Kepmenaker 102/2004)", () => {
  it("weights working-day hours: first hour ×1.5, then ×2", () => {
    assert.equal(weightedHours({ minutes: 60, restDay: false, sixDayWeek: false }), 1.5);
    assert.equal(weightedHours({ minutes: 180, restDay: false, sixDayWeek: false }), 5.5);
    assert.equal(weightedHours({ minutes: 30, restDay: false, sixDayWeek: false }), 0.75);
  });

  it("weights rest-day hours for 5- and 6-day weeks", () => {
    // 5-day: 8h ×2, 9th ×3, 10th+ ×4
    assert.equal(weightedHours({ minutes: 8 * 60, restDay: true, sixDayWeek: false }), 16);
    assert.equal(weightedHours({ minutes: 10 * 60, restDay: true, sixDayWeek: false }), 16 + 3 + 4);
    // 6-day: 7h ×2, 8th ×3, 9th+ ×4
    assert.equal(weightedHours({ minutes: 9 * 60, restDay: true, sixDayWeek: true }), 14 + 3 + 4);
  });

  it("pays 1/173 of the monthly fixed wage per weighted hour, rounded once", () => {
    const pay = overtimePay(5_190_000, [
      { day: "2026-11-02", minutes: 120, restDay: false, sixDayWeek: false }, // 3.5
      { day: "2026-11-08", minutes: 240, restDay: true, sixDayWeek: false }, // 8
    ]);
    assert.equal(pay.minutes, 360);
    assert.equal(pay.weightedHours, 11.5);
    assert.equal(pay.hourlyWage, 30_000);
    assert.equal(pay.amount, 345_000);
    assert.match(overtimeNote(pay), /6 jam lembur = 11,5 jam terhitung/);
    assert.equal(overtimePay(5_000_000, []).amount, 0);
    assert.equal(overtimePay(-1, [{ day: "x", minutes: 60, restDay: false, sixDayWeek: false }]).amount, 0);
  });

  it("replaces the overtime component and recomputes totals like the engine", () => {
    const result = {
      employeeId: "e",
      totalEarnings: 5_000_000,
      totalDeductions: 100_000,
      netAmount: 4_900_000,
      components: [
        { componentId: "basic", componentCode: "GAPOK", componentName: "Gaji", componentType: "earning" as const, amount: 5_000_000 },
        { componentId: "ot", componentCode: "LEMBUR", componentName: "Lembur", componentType: "earning" as const, amount: 0 },
        { componentId: "bpjs", componentCode: "BPJS", componentName: "BPJS", componentType: "deduction" as const, amount: 100_000 },
      ],
    };
    const next = withOvertimeAmount(result, "ot", 345_000);
    assert.equal(next.totalEarnings, 5_345_000);
    assert.equal(next.netAmount, 5_245_000);
    assert.equal(result.components[1].amount, 0, "input is not mutated");
    assert.equal(withOvertimeAmount(result, "missing", 1), result);
  });
});

describe("payroll integration guard", () => {
  const root = join(import.meta.dirname, "..", "..");
  const actions = readFileSync(join(root, "features/payroll/actions.ts"), "utf8");
  it("only changes the run when an active LEMBUR earning component exists", () => {
    assert.match(actions, /c\.code\.toUpperCase\(\) === OVERTIME_COMPONENT_CODE && c\.type === "earning"/);
    assert.match(actions, /const overtimeByEmployee = overtimeComponent\s*\? await loadApprovedOvertime\(/);
    assert.match(actions, /if \(overtimeComponent\) \{/);
  });
  it("excludes the overtime component from the wage base and reads only approved overtime", () => {
    assert.match(actions, /c\.calculationMethod === "fixed" && c\.id !== overtimeComponent\?\.id/);
    const loader = readFileSync(join(root, "features/time/overtime-payroll.queries.ts"), "utf8");
    assert.match(loader, /eq\(overtimeRequests\.status, "approved"\)/);
    assert.match(loader, /tableExists\(executor, "overtime_requests"\)/);
  });
});
