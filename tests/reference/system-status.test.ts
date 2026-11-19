import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { migrationStatus } from "../../lib/db/migration-status.ts";

describe("migration status", () => {
  const entries = [
    { idx: 0, when: 100, tag: "0000_a" },
    { idx: 1, when: 200, tag: "0001_b" },
    { idx: 2, when: 300, tag: "0002_c" },
    { idx: 3, when: 400, tag: "0003_d" },
  ];
  it("classifies applied, pending and skipped", () => {
    const s = migrationStatus(entries, [100, 300]);
    assert.deepEqual(s.items.map((i) => i.state), ["applied", "skipped", "applied", "pending"]);
    assert.deepEqual([s.applied, s.pending, s.skipped], [2, 1, 1]);
  });
  it("treats a fresh database as all pending", () => {
    assert.equal(migrationStatus(entries, []).pending, 4);
  });
  it("the real journal never goes back in time; new entries strictly increase", () => {
    const journal = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "db/migrations/meta/_journal.json"), "utf8")) as { entries: { idx: number; when: number; tag: string }[] };
    // Historical: these three were generated together and share one `when`
    // (all applied in the same run everywhere). Never add to this list.
    const SAME_WHEN = new Set(["0011_nasty_khan", "0015_user_account_name", "0016_employee_master_data"]);
    journal.entries.forEach((e, i) => {
      if (i === 0) return;
      const prev = journal.entries[i - 1];
      assert.equal(e.idx, prev.idx + 1, `${e.tag} idx`);
      if (SAME_WHEN.has(e.tag) && SAME_WHEN.has(prev.tag)) assert.equal(e.when, prev.when);
      else assert.ok(e.when > prev.when, `${e.tag} must be newer than ${prev.tag}`);
    });
  });
});

describe("system status guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  it("page is super-admin only and lists every module readiness probe", () => {
    assert.match(read("app/(dashboard)/settings/system/page.tsx"), /await requireSuperAdmin\(user\.id\)/);
    const status = read("features/system/status.ts");
    for (const probe of [
      "isComplianceModuleReady",
      "isTimeModuleReady",
      "isProfileChangeModuleReady",
      "isHelpdeskModuleReady",
      "isDocumentsModuleReady",
      "isLetterTemplatesReady",
      "isTimesheetModuleReady",
      "isOrgMasterReady",
      "isAgendaReady",
      "isApprovalChainReady",
    ]) {
      assert.match(status, new RegExp(`ready: ${probe}`), probe);
    }
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/settings/system"');
    assert.match(nav.slice(at, nav.indexOf("}", at)), /superadminOnly: true/);
  });
});
