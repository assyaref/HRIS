import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { addMonths, evaluateValidity } from "../../features/compliance/validity.ts";

describe("compliance validity", () => {
  const today = "2026-11-18";
  it("classifies by valid-until", () => {
    assert.equal(evaluateValidity(null, today).status, "no_expiry");
    assert.equal(evaluateValidity("2026-11-17", today).status, "expired");
    assert.equal(evaluateValidity("2026-11-18", today).status, "expiring");
    assert.equal(evaluateValidity("2026-12-18", today).status, "expiring");
    assert.equal(evaluateValidity("2026-12-19", today).status, "valid");
    assert.equal(evaluateValidity("2026-12-19", today).daysRemaining, 31);
  });
  it("adds months safely at month ends", () => {
    assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
    assert.equal(addMonths("2028-01-31", 1), "2028-02-29");
    assert.equal(addMonths("2026-11-18", 12), "2027-11-18");
    assert.equal(addMonths("2026-11-18", 24), "2028-11-18");
  });
});

describe("migration 0023 (compliance) is additive and RESTRICT-only", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0023_compliance_mcu_training.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const NEW = ["medical_checkups", "training_masters", "employee_trainings", "training_requirements"];

  it("only creates the four new tables and touches nothing else", () => {
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
    assert.equal(last.tag, "0023_compliance_mcu_training");
    assert.equal(last.idx, previous.idx + 1);
    assert.ok(last.when > previous.when);
  });

  it("deletion plans register the new employee tables as optional", () => {
    const queries = readFileSync(join(root, "features/employees/queries.ts"), "utf8");
    const purge = readFileSync(join(root, "features/employees/test-data-purge.queries.ts"), "utf8");
    for (const source of [queries, purge]) {
      assert.match(source, /optionalTable: "medical_checkups"/);
      assert.match(source, /optionalTable: "employee_trainings"/);
      assert.match(source, /tableExists\(tx, source\.optionalTable\)/);
    }
  });
});

import { computeMatrixCompliance } from "../../features/compliance/matrix.ts";

describe("training matrix compliance", () => {
  const employees = [
    { id: "a", employeeNumber: "E1", name: "Ani", position: "Operator" },
    { id: "b", employeeNumber: "E2", name: "Budi", position: " operator " },
    { id: "c", employeeNumber: "E3", name: "Cici", position: "Admin" },
    { id: "d", employeeNumber: "E4", name: "Dodi", position: null },
  ];
  const requirements = [
    { position: "Operator", trainingMasterId: "k3", trainingName: "K3 Umum" },
    { position: "Operator", trainingMasterId: "ff", trainingName: "Fire Fighting" },
  ];
  it("counts only non-expired records of the required master", () => {
    const result = computeMatrixCompliance(employees, requirements, [
      { employeeId: "a", trainingMasterId: "k3", status: "valid" },
      { employeeId: "a", trainingMasterId: "ff", status: "expiring" },
      { employeeId: "b", trainingMasterId: "k3", status: "expired" },
      { employeeId: "b", trainingMasterId: null, status: "valid" },
    ]);
    assert.equal(result.rows.length, 2, "positions without requirements are left out");
    assert.equal(result.required, 4);
    assert.equal(result.fulfilled, 2);
    assert.equal(result.percent, 50);
    assert.deepEqual(result.rows[0].missing, ["K3 Umum", "Fire Fighting"]);
    assert.equal(result.rows[0].employee.id, "b", "position match is trimmed and case-insensitive");
  });
  it("is 100% when nothing is required", () => {
    assert.equal(computeMatrixCompliance(employees, [], []).percent, 100);
  });
});
