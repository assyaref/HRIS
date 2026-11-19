import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { isForDepartment, parseAudience, rsvpSummary, wibDay, wibTime, whenLabel } from "../../features/agenda/rules.ts";

describe("agenda rules", () => {
  it("matches audiences by department, case-insensitively", () => {
    assert.equal(isForDepartment([], null), true);
    assert.equal(isForDepartment(["Akuntansi"], " akuntansi "), true);
    assert.equal(isForDepartment(["Akuntansi"], "Produksi"), false);
    assert.equal(isForDepartment(["Akuntansi"], null), false);
  });

  it("parses audience lists", () => {
    assert.deepEqual(parseAudience(["Akuntansi, produksi", " akuntansi ", ""]), ["Akuntansi", "produksi"]);
  });

  it("summarizes RSVP against invited employees only", () => {
    const s = rsvpSummary(["a", "b", "c", "d"], [
      { employeeId: "a", response: "going" },
      { employeeId: "b", response: "maybe" },
      { employeeId: "c", response: "not_going" },
      { employeeId: "x", response: "going" },
    ]);
    assert.deepEqual(s, { going: 1, maybe: 1, notGoing: 1, pending: 1 });
  });

  it("formats WIB times", () => {
    const start = new Date("2026-11-23T02:00:00Z"); // 09:00 WIB
    const end = new Date("2026-11-23T03:30:00Z");
    assert.equal(wibDay(new Date("2026-11-22T18:00:00Z")), "2026-11-23");
    assert.equal(wibTime(start), "09:00");
    assert.match(whenLabel(start, end, false), /23 November 2026 · 09:00–10:30 WIB$/);
    assert.match(whenLabel(start, end, true), /sepanjang hari$/);
  });
});

describe("migration 0031 (agenda)", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0031_agenda.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  it("is additive and RESTRICT on employees", () => {
    const NEW = ["agenda_events", "agenda_responses"];
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort(), [...NEW].sort());
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.ok(NEW.includes(m[1]), m[1]);
    assert.doesNotMatch(sql, /DROP /);
    assert.deepEqual([...sql.matchAll(/REFERENCES "public"\."employees"\("id"\) ON DELETE (\w+)/g)].map((m) => m[1]), ["restrict"]);
  });
  it("is journaled last", () => {
    const last = journal.entries.at(-1)!;
    assert.equal(last.tag, "0031_agenda");
    assert.equal(last.idx, journal.entries.at(-2)!.idx + 1);
    assert.ok(last.when > journal.entries.at(-2)!.when);
  });
  it("deletion plans register responses as optional", () => {
    for (const p of ["features/employees/queries.ts", "features/employees/test-data-purge.queries.ts"]) {
      assert.match(readFileSync(join(root, p), "utf8"), /optionalTable: "agenda_responses"/);
    }
  });
});

describe("agenda guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("only publishers manage; RSVP only for invited, open events", () => {
    const a = read("features/agenda/actions.ts");
    assert.match(a, /^"use server";/);
    assert.match(a, /permissionCodes\.includes\(PERMISSIONS\.ANNOUNCEMENTS_CREATE\)/);
    assert.equal((a.match(/if \(!ctx\.canManage\) return FORBIDDEN;/g) ?? []).length, 2);
    assert.match(a, /isForDepartment\(event\[0\]\.audience, me\[0\]\?\.department \?\? null\)/);
    assert.match(a, /event\[0\]\.cancelled/);
    assert.match(a, /event\[0\]\.endAt < new Date\(\)/);
  });
  it("detail page hides events from non-invited non-publishers; export needs announcements.create", () => {
    assert.match(read("app/(dashboard)/agenda/[eventId]/page.tsx"), /if \(!canManage && !invited\) notFound\(\);/);
    assert.match(read("app/api/reports/export/route.ts"), /agenda: \[PERMISSIONS\.ANNOUNCEMENTS_CREATE\]/);
  });
});
