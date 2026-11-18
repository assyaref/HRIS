import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  clockMinutes,
  formatDuration,
  isoWeekday,
  monthGrid,
  parseWorkingDays,
  shiftWorkMinutes,
  spanMinutes,
  summarizeOvertime,
  workingDaysLabel,
} from "../../features/time/rules.ts";

describe("time rules", () => {
  it("parses clock times strictly", () => {
    assert.equal(clockMinutes("08:30"), 510);
    assert.equal(clockMinutes("23:59"), 1439);
    assert.equal(clockMinutes("24:00"), null);
    assert.equal(clockMinutes("8:30"), null);
    assert.equal(clockMinutes("ab:cd"), null);
  });

  it("computes spans, crossing midnight", () => {
    assert.equal(spanMinutes("17:00", "19:30"), 150);
    assert.equal(spanMinutes("22:00", "02:00"), 240);
    assert.equal(spanMinutes("10:00", "10:00"), null);
    assert.equal(spanMinutes("x", "10:00"), null);
  });

  it("subtracts the break from a shift, never below zero", () => {
    assert.equal(shiftWorkMinutes("08:00", "17:00", 60), 480);
    assert.equal(shiftWorkMinutes("22:00", "06:00", 60), 420);
    assert.equal(shiftWorkMinutes("08:00", "08:30", 60), 0);
  });

  it("formats durations", () => {
    assert.equal(formatDuration(45), "45 m");
    assert.equal(formatDuration(120), "2 j");
    assert.equal(formatDuration(150), "2 j 30 m");
    assert.equal(formatDuration(-5), "0 m");
  });

  it("parses and labels working days", () => {
    assert.deepEqual(parseWorkingDays("5,1,2,2,9,x,3,4"), [1, 2, 3, 4, 5]);
    assert.equal(workingDaysLabel([1, 2, 3, 4, 5]), "Sen–Jum");
    assert.equal(workingDaysLabel([1, 3, 5]), "Sen, Rab, Jum");
    assert.equal(workingDaysLabel([1, 2, 3, 4, 5, 6, 7]), "Setiap hari");
    assert.equal(workingDaysLabel([]), "—");
  });

  it("builds a Monday-first month grid", () => {
    const weeks = monthGrid(2026, 11); // 1 Nov 2026 is a Sunday
    assert.ok(weeks.every((w) => w.length === 7));
    assert.deepEqual(weeks[0].slice(0, 7), [null, null, null, null, null, null, "2026-11-01"]);
    assert.equal(weeks.flat().filter(Boolean).length, 30);
    assert.equal(isoWeekday("2026-11-01"), 7);
    assert.equal(isoWeekday("2026-11-02"), 1);
  });

  it("summarizes overtime, counting minutes of approved requests only", () => {
    const s = summarizeOvertime([
      { status: "approved", totalMinutes: 120 },
      { status: "approved", totalMinutes: 30 },
      { status: "pending", totalMinutes: 600 },
      { status: "rejected", totalMinutes: 60 },
      { status: "cancelled", totalMinutes: 60 },
    ]);
    assert.deepEqual(s, { total: 5, pending: 1, approved: 2, rejected: 1, cancelled: 1, approvedMinutes: 150 });
  });
});

describe("migration 0024 (time management) is additive and RESTRICT-only", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0024_time_management.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const NEW = ["holidays", "shifts", "work_groups", "work_group_members", "overtime_requests"];

  it("only creates the five new tables and touches nothing else", () => {
    const created = [...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual(created, [...NEW].sort());
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.ok(NEW.includes(m[1]), `unexpected ALTER on ${m[1]}`);
    for (const m of sql.matchAll(/INDEX "\w+" ON "(\w+)"/g)) assert.ok(NEW.includes(m[1]), `unexpected index on ${m[1]}`);
    assert.doesNotMatch(sql, /DROP /);
  });

  it("references employees only with ON DELETE restrict", () => {
    const toEmployees = [...sql.matchAll(/REFERENCES "public"\."employees"\("id"\) ON DELETE (\w+)/g)].map((m) => m[1]);
    assert.deepEqual(toEmployees, ["restrict", "restrict"]);
  });

  it("is journaled last with a fresh, increasing when", () => {
    const last = journal.entries.at(-1)!;
    const previous = journal.entries.at(-2)!;
    assert.equal(last.tag, "0024_time_management");
    assert.equal(last.idx, previous.idx + 1);
    assert.ok(last.when > previous.when);
  });

  it("deletion plans register the new employee tables as optional", () => {
    const queries = readFileSync(join(root, "features/employees/queries.ts"), "utf8");
    const purge = readFileSync(join(root, "features/employees/test-data-purge.queries.ts"), "utf8");
    for (const source of [queries, purge]) {
      assert.match(source, /optionalTable: "work_group_members"/);
      assert.match(source, /optionalTable: "overtime_requests"/);
    }
  });
});

describe("time management guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("every page checks permission and module readiness", () => {
    const pages: [string, RegExp][] = [
      ["app/(dashboard)/time/calendar/page.tsx", /requirePermission\(user\.id, PERMISSIONS\.ATTENDANCE_VIEW\)/],
      ["app/(dashboard)/time/shifts/page.tsx", /requirePermission\(user\.id, PERMISSIONS\.ATTENDANCE_MANAGE\)/],
      ["app/(dashboard)/overtime/page.tsx", /requirePermission\(user\.id, PERMISSIONS\.ATTENDANCE_VIEW\)/],
      ["app/(dashboard)/overtime/management/page.tsx", /requireAnyPermission\(user\.id, \[PERMISSIONS\.ATTENDANCE_APPROVE, PERMISSIONS\.ATTENDANCE_MANAGE\]\)/],
    ];
    for (const [path, guard] of pages) {
      const source = read(path);
      assert.match(source, guard, path);
      assert.match(source, /isTimeModuleReady\(\)/, path);
    }
  });

  it("actions re-authorize and scope every write to the organization", () => {
    const source = read("features/time/actions.ts");
    assert.match(source, /^"use server";/);
    const exported = [...source.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
    assert.ok(exported.length >= 12);
    for (const name of exported) {
      const body = source.slice(source.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(body, /await authorize\(/, `${name} must authorize`);
    }
    assert.match(source, /Anda tidak dapat meninjau pengajuan lembur Anda sendiri/);
  });

  it("the approvals inbox only queries overtime once the module is ready", () => {
    assert.match(read("features/approvals/queries.ts"), /filters\.kinds\.includes\("overtime"\) && \(await isTimeModuleReady\(\)\)/);
  });
});
