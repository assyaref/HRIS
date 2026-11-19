import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { hrGate, needsManager } from "../../features/approval-chain/rules.ts";

const base = { enabled: true, managerUserId: "m", employeeUserId: "e", managerDecision: null, actorUserId: "hr" } as const;

describe("two-level approval gate", () => {
  it("never blocks when off or when there is no usable manager", () => {
    assert.equal(hrGate({ ...base, enabled: false }).state, "not_required");
    assert.equal(hrGate({ ...base, managerUserId: null }).state, "not_required");
    assert.equal(hrGate({ ...base, managerUserId: "e" }).state, "not_required"); // own manager = self
  });
  it("waits for the manager, then lets the final approver decide", () => {
    assert.equal(hrGate(base).state, "waiting");
    assert.equal(hrGate({ ...base, managerDecision: "approved" }).state, "done");
    assert.equal(hrGate({ ...base, actorUserId: "m" }).state, "actor_is_manager");
  });
  it("tells the inbox which requests still need the manager", () => {
    assert.equal(needsManager({ enabled: true, managerUserId: "m", employeeUserId: "e", managerDecision: null }), true);
    assert.equal(needsManager({ enabled: true, managerUserId: "m", employeeUserId: "e", managerDecision: "approved" }), false);
    assert.equal(needsManager({ enabled: false, managerUserId: "m", employeeUserId: "e", managerDecision: null }), false);
  });
});

describe("migration 0032 (approval chain)", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0032_approval_chain.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  it("is additive with no employee reference", () => {
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort(), ["approval_settings", "approval_steps"]);
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.ok(["approval_settings", "approval_steps"].includes(m[1]));
    assert.doesNotMatch(sql, /"employees"|DROP /);
  });
  it("is journaled last", () => {
    const last = journal.entries.at(-1)!;
    assert.equal(last.tag, "0032_approval_chain");
    assert.equal(last.idx, journal.entries.at(-2)!.idx + 1);
    assert.ok(last.when > journal.entries.at(-2)!.when);
  });
});

describe("two-level approval wiring", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");
  const cases: [string, string, string, string][] = [
    ["features/leave/actions.ts", "reviewLeaveRequestAction", "managerReviewLeaveAction", '"leave"'],
    ["features/permission/actions.ts", "reviewPermissionRequestAction", "managerReviewPermissionAction", '"permission"'],
    ["features/time/actions.ts", "reviewOvertimeAction", "managerReviewOvertimeAction", '"overtime"'],
  ];
  for (const [file, hr, manager, type] of cases) {
    it(`${file}: final approval is gated; only the direct manager decides the first step`, () => {
      const source = read(file);
      const block = (name: string) => source.slice(source.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(block(hr), new RegExp(`finalApprovalBlock\\(\\s*[a-zA-Z.]+,\\s*${type}`));
      const m = block(manager);
      assert.match(m, new RegExp(`managerStepTypes\\([a-zA-Z.]+\\)\\)\\.has\\(${type}\\)`));
      assert.match(m, /if \(manager\.managerUserId !== user\.id\)/);
      assert.match(m, /recordManagerDecision\(/);
      assert.match(m, /Tuliskan alasan penolakan/);
    });
  }
  it("decision cores are not exported (never callable as server actions)", () => {
    assert.match(read("features/leave/actions.ts"), /\nasync function decideLeaveRequest\(/);
    assert.match(read("features/permission/actions.ts"), /\nasync function decidePermissionRequest\(/);
  });
  it("settings need settings.manage; the team menu is for direct managers only", () => {
    assert.match(read("features/approval-chain/actions.ts"), /PERMISSIONS\.SETTINGS_MANAGE/);
    assert.match(read("app/(dashboard)/settings/approval-flow/page.tsx"), /requirePermission\(user\.id, PERMISSIONS\.SETTINGS_MANAGE\)/);
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/team-approvals"');
    assert.match(nav.slice(at, nav.indexOf("}", at)), /teamOnly: true/);
    assert.match(read("components/layout/authorized-navigation.ts"), /\(!item\.teamOnly \|\| managesTeam\)/);
  });
});
