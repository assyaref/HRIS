import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { cleanName, groupValues, inconsistent, nameKey, unregistered, usageCount } from "../../features/org-master/rules.ts";

describe("organization master matching", () => {
  const values = [
    { value: "Akuntansi", count: 5 },
    { value: " akuntansi ", count: 2 },
    { value: "Gudang  Utama", count: 3 },
    { value: "HRD", count: 1 },
    { value: "   ", count: 4 },
  ];

  it("normalizes names", () => {
    assert.equal(cleanName("  Gudang   Utama "), "Gudang Utama");
    assert.equal(nameKey(" AKUNTANSI "), "akuntansi");
  });

  it("groups spellings and prefers the most used one", () => {
    const groups = groupValues(values);
    assert.deepEqual(
      groups.map((g) => [g.preferred, g.total, g.spellings.length]),
      [
        ["Akuntansi", 7, 2],
        ["Gudang Utama", 3, 1],
        ["HRD", 1, 1],
      ]
    );
  });

  it("finds unregistered values, inconsistent spellings and usage", () => {
    const groups = groupValues(values);
    assert.deepEqual(unregistered(groups, ["akuntansi", "HRD"]).map((g) => g.preferred), ["Gudang Utama"]);
    const off = inconsistent(groups, ["Akuntansi", "Gudang Utama"]);
    assert.deepEqual(off.map((o) => [o.master, o.spellings.map((s) => s.value)]), [
      ["Akuntansi", [" akuntansi "]],
      ["Gudang Utama", ["Gudang  Utama"]],
    ]);
    assert.equal(usageCount(groups, "AKUNTANSI"), 7);
    assert.equal(usageCount(groups, "Keuangan"), 0);
  });
});

describe("migration 0030 (organization master)", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0030_org_master.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  it("is additive and never touches employees", () => {
    const NEW = ["departments", "job_positions", "job_grades"];
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort(), [...NEW].sort());
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.ok(NEW.includes(m[1]), m[1]);
    assert.doesNotMatch(sql, /"employees"/);
    assert.doesNotMatch(sql, /DROP /);
  });
  it("is journaled with a fresh, increasing when", () => {
    const at = journal.entries.findIndex((e) => e.tag === "0030_org_master");
    assert.ok(at > 0);
    assert.equal(journal.entries[at].idx, journal.entries[at - 1].idx + 1);
    assert.ok(journal.entries[at].when > journal.entries[at - 1].when);
  });
});

describe("organization master guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("changes need employees.view + employment.update and stay in the organization", () => {
    const a = read("features/org-master/actions.ts");
    assert.match(a, /^"use server";/);
    assert.match(a, /granted\.has\(PERMISSIONS\.EMPLOYEES_VIEW\) && granted\.has\(PERMISSIONS\.EMPLOYEES_EMPLOYMENT_UPDATE\)/);
    assert.match(a, /eq\(employees\.organizationId, ctx\.organizationId\)/);
    for (const name of [...a.matchAll(/export async function (\w+)/g)].map((m) => m[1])) {
      const body = a.slice(a.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(body, /await context\(\)/, name);
    }
  });
  it("page and nav require employees.view; employee forms offer master suggestions", () => {
    assert.match(read("app/(dashboard)/organization/master/page.tsx"), /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/organization/master"');
    assert.match(nav.slice(at, nav.indexOf("}", at)), /permission: PERMISSIONS\.EMPLOYEES_VIEW/);
    assert.match(read("features/employees/master-data/sections.tsx"), /list="org-master-departments"/);
    assert.match(read("features/employees/employee-create-dialog.tsx"), /list="org-master-positions"/);
    assert.match(read("features/org-master/suggestions.tsx"), /if \(!\(await isOrgMasterReady\(\)\)\) return null;/);
  });
});
