import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  hhmm,
  isEditable,
  isoWeek,
  parseDuration,
  shiftWeek,
  weekDays,
  weekLabel,
  weekParam,
  weekStartOf,
  weekStatus,
} from "../../features/timesheets/rules.ts";

describe("timesheet rules", () => {
  it("finds ISO weeks", () => {
    assert.equal(weekStartOf("2026-11-22"), "2026-11-16"); // Sunday → Monday
    assert.equal(weekStartOf("2026-11-16"), "2026-11-16");
    assert.deepEqual(weekDays("2026-11-16").slice(-1), ["2026-11-22"]);
    assert.equal(shiftWeek("2026-11-16", 1), "2026-11-23");
    assert.deepEqual(isoWeek("2026-11-16"), { year: 2026, week: 47 });
    assert.deepEqual(isoWeek("2026-12-28"), { year: 2026, week: 53 });
    assert.deepEqual(isoWeek("2027-01-04"), { year: 2027, week: 1 });
    assert.deepEqual(isoWeek("2024-12-30"), { year: 2025, week: 1 });
    assert.equal(weekLabel("2026-11-16"), "16 – 22 Nov 2026");
    assert.equal(weekLabel("2026-12-28"), "28 Des 2026 – 3 Jan 2027");
    assert.equal(weekParam("2026-11-19", "2026-01-01"), "2026-11-16");
    assert.equal(weekParam("nope", "2026-11-19"), "2026-11-16");
  });

  it("parses durations", () => {
    assert.equal(parseDuration("1:30"), 90);
    assert.equal(parseDuration("1,5"), 90);
    assert.equal(parseDuration("2 jam"), 120);
    assert.equal(parseDuration("45m"), 45);
    assert.equal(parseDuration("16"), 960);
    assert.equal(parseDuration("17"), null);
    assert.equal(parseDuration("0"), null);
    assert.equal(parseDuration("abc"), null);
    assert.equal(hhmm(450), "7:30");
  });

  it("derives the week status", () => {
    assert.equal(weekStatus([]), "empty");
    assert.equal(weekStatus(["approved", "rejected"]), "rejected");
    assert.equal(weekStatus(["submitted", "draft"]), "draft");
    assert.equal(weekStatus(["submitted", "approved"]), "submitted");
    assert.equal(weekStatus(["approved"]), "approved");
    assert.ok(isEditable("draft") && isEditable("rejected") && !isEditable("submitted") && !isEditable("approved"));
  });
});

describe("migration 0029 (timesheets)", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0029_timesheets.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  it("is additive and RESTRICT on employees", () => {
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]), ["timesheet_entries"]);
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.equal(m[1], "timesheet_entries");
    assert.doesNotMatch(sql, /DROP /);
    assert.deepEqual([...sql.matchAll(/REFERENCES "public"\."employees"\("id"\) ON DELETE (\w+)/g)].map((m) => m[1]), ["restrict"]);
  });
  it("is journaled last", () => {
    const last = journal.entries.at(-1)!;
    assert.equal(last.tag, "0029_timesheets");
    assert.equal(last.idx, journal.entries.at(-2)!.idx + 1);
    assert.ok(last.when > journal.entries.at(-2)!.when);
  });
  it("deletion plans register the table as optional", () => {
    for (const p of ["features/employees/queries.ts", "features/employees/test-data-purge.queries.ts"]) {
      assert.match(readFileSync(join(root, p), "utf8"), /optionalTable: "timesheet_entries"/);
    }
  });
});

describe("timesheet guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("own entries only while editable; reviewers never review themselves", () => {
    const a = read("features/timesheets/actions.ts");
    assert.match(a, /^"use server";/);
    assert.match(a, /eq\(timesheetEntries\.employeeId, ctx\.employeeId\)/);
    assert.match(a, /inArray\(timesheetEntries\.status, \["draft", "rejected"\]\)/);
    assert.match(a, /if \(ctx\.employeeId === employeeId\) return \{ ok: false, message: "Anda tidak dapat meninjau timesheet Anda sendiri\." \}/);
    assert.match(a, /data\.workDate > todayKey\(\)/);
    for (const name of [...a.matchAll(/export async function (\w+)/g)].map((m) => m[1])) {
      const body = a.slice(a.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(body, /await context\(\)/, name);
    }
  });
  it("pages, nav and export agree", () => {
    assert.match(read("app/(dashboard)/timesheet/page.tsx"), /requirePermission\(user\.id, PERMISSIONS\.ATTENDANCE_VIEW\)/);
    assert.match(
      read("app/(dashboard)/timesheet/management/page.tsx"),
      /requireAnyPermission\(user\.id, \[PERMISSIONS\.ATTENDANCE_APPROVE, PERMISSIONS\.ATTENDANCE_MANAGE\]\)/
    );
    const nav = read("components/layout/navigation.ts");
    const entry = (href: string) => {
      const at = nav.indexOf(`href: "${href}"`);
      return nav.slice(at, nav.indexOf("}", at));
    };
    assert.match(entry("/timesheet"), /permission: PERMISSIONS\.ATTENDANCE_VIEW/);
    assert.match(entry("/timesheet/management"), /anyPermission: \[PERMISSIONS\.ATTENDANCE_APPROVE, PERMISSIONS\.ATTENDANCE_MANAGE\]/);
    assert.match(read("app/api/reports/export/route.ts"), /timesheet: \[PERMISSIONS\.ATTENDANCE_MANAGE\]/);
    assert.match(read("features/approvals/queries.ts"), /filters\.kinds\.includes\("timesheet"\) && \(await isTimesheetModuleReady\(\)\)/);
  });
});
