import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  CHANGEABLE_FIELD_KEYS,
  diffProfile,
  displayFieldValue,
  validateFieldValue,
} from "../../features/profile-changes/fields.ts";

describe("profile change rules", () => {
  it("whitelists personal fields only (no employment / account identity)", () => {
    for (const forbidden of ["email", "firstName", "lastName", "employeeNumber", "position", "salary", "userId"]) {
      assert.ok(!(CHANGEABLE_FIELD_KEYS as string[]).includes(forbidden), forbidden);
    }
  });

  it("validates values", () => {
    assert.equal(validateFieldValue("phone", "+62 812-3456-7890"), null);
    assert.ok(validateFieldValue("phone", "abc"));
    assert.ok(validateFieldValue("phone", null));
    assert.equal(validateFieldValue("personalEmail", "a@b.co"), null);
    assert.ok(validateFieldValue("personalEmail", "nope"));
    assert.equal(validateFieldValue("nik", "3201234567890001"), null);
    assert.ok(validateFieldValue("nik", "12345"));
    assert.ok(validateFieldValue("maritalStatus", "Complicated"));
    assert.equal(validateFieldValue("maritalStatus", "Married"), null);
    assert.ok(validateFieldValue("birthDate", "2999-01-01"));
    assert.equal(validateFieldValue("birthDate", "1990-05-17"), null);
    assert.equal(validateFieldValue("nickname", null), null);
  });

  it("keeps only real changes and ignores fields not submitted", () => {
    const { changes, errors } = diffProfile(
      { phone: "0811", nickname: "Ani", religion: null, nik: "3201234567890001" },
      { phone: " 0811 ", nickname: "Ann", religion: "Islam", personalEmail: "bad" }
    );
    assert.deepEqual(changes, {
      nickname: { from: "Ani", to: "Ann" },
      religion: { from: null, to: "Islam" },
    });
    assert.deepEqual(Object.keys(errors), ["personalEmail"]);
  });

  it("displays option labels and empty values", () => {
    assert.equal(displayFieldValue("maritalStatus", "Married"), "Menikah");
    assert.equal(displayFieldValue("phone", null), "—");
  });
});

describe("migration 0025 (profile change requests) is additive and RESTRICT-only", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0025_profile_change_requests.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };

  it("creates only profile_change_requests", () => {
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]), ["profile_change_requests"]);
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.equal(m[1], "profile_change_requests");
    assert.doesNotMatch(sql, /DROP /);
    assert.deepEqual(
      [...sql.matchAll(/REFERENCES "public"\."employees"\("id"\) ON DELETE (\w+)/g)].map((m) => m[1]),
      ["restrict"]
    );
  });

  it("is journaled last with a fresh, increasing when", () => {
    const last = journal.entries.at(-1)!;
    const previous = journal.entries.at(-2)!;
    assert.equal(last.tag, "0025_profile_change_requests");
    assert.equal(last.idx, previous.idx + 1);
    assert.ok(last.when > previous.when);
  });

  it("deletion plans register the table as optional", () => {
    for (const p of ["features/employees/queries.ts", "features/employees/test-data-purge.queries.ts"]) {
      assert.match(readFileSync(join(root, p), "utf8"), /optionalTable: "profile_change_requests"/);
    }
  });
});

describe("profile change guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("review needs employees.view + personal.update, never one's own", () => {
    const actions = read("features/profile-changes/actions.ts");
    assert.match(actions, /^"use server";/);
    assert.match(actions, /PERMISSIONS\.EMPLOYEES_VIEW\) && granted\.has\(PERMISSIONS\.EMPLOYEES_PERSONAL_UPDATE\)/);
    assert.match(actions, /request\.employeeUserId === user\.id/);
    assert.match(actions, /isChangeableField\(field\)/);
    assert.match(actions, /eq\(profileChangeRequests\.status, "pending"\)/);
  });

  it("the HR page and nav entry agree", () => {
    const page = read("app/(dashboard)/profile-changes/page.tsx");
    assert.match(page, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
    assert.match(page, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_PERSONAL_VIEW\)/);
    assert.match(page, /isProfileChangeModuleReady\(\)/);
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/profile-changes"');
    const entry = nav.slice(at, nav.indexOf("}", at));
    assert.match(entry, /permission: PERMISSIONS\.EMPLOYEES_PERSONAL_VIEW/);
    assert.match(entry, /anyPermission: \[PERMISSIONS\.EMPLOYEES_VIEW\]/);
  });
});
