import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  daysBetween,
  evaluateContract,
  remainingLabel,
} from "../../features/compliance/contract-status.ts";
import {
  buildEmployeeMovementReport,
  type MovementEmployee,
} from "../../features/reports/employee-movement.ts";
import { buildOrgChart } from "../../features/org-chart/build-tree.ts";
import {
  ageDistribution,
  ageOn,
  genderSplit,
  profileCompleteness,
  type InsightEmployee,
} from "../../features/insights/workforce.ts";

describe("contract status", () => {
  const today = "2026-11-18";
  it("counts whole days across months", () => {
    assert.equal(daysBetween("2026-11-18", "2026-12-18"), 30);
    assert.equal(daysBetween("2026-11-18", "2026-11-17"), -1);
  });
  it("classifies expired / expiring / active / no_end / inactive", () => {
    const at = (contractEnd: string | null, employmentStatus = "active") =>
      evaluateContract({ employmentStatus, contractEnd, today }).status;
    assert.equal(at("2026-11-17"), "expired");
    assert.equal(at("2026-11-18"), "expiring");
    assert.equal(at("2026-12-18"), "expiring");
    assert.equal(at("2026-12-19"), "active");
    assert.equal(at(null), "no_end");
    assert.equal(at("2027-01-01", "inactive"), "inactive");
  });
  it("labels the remaining time", () => {
    assert.equal(remainingLabel(0), "Berakhir hari ini");
    assert.equal(remainingLabel(5), "5 hari lagi");
    assert.equal(remainingLabel(-3), "Lewat 3 hari");
    assert.equal(remainingLabel(null), "—");
  });
});

describe("employee movement report", () => {
  const base = (over: Partial<MovementEmployee>): MovementEmployee => ({
    id: Math.random().toString(36),
    employeeNumber: "E",
    name: "N",
    position: null,
    department: "Ops",
    workLocation: "Site A",
    employmentStatus: "active",
    hireDate: "2025-01-01",
    exitDate: null,
    ...over,
  });
  const rows = [
    base({}), // stays
    base({ hireDate: "2026-11-05" }), // joins
    base({ hireDate: "2024-03-01", exitDate: "2026-11-10", employmentStatus: "inactive" }), // leaves
    base({ hireDate: "2024-03-01", exitDate: "2026-01-01", employmentStatus: "inactive" }), // left before
    base({ hireDate: null, department: null }), // unknown hire date counts as employed
  ];
  const report = buildEmployeeMovementReport(rows, "2026-11-01", "2026-11-30");
  it("counts joiners, leavers and headcount", () => {
    assert.equal(report.joined.length, 1);
    assert.equal(report.left.length, 1);
    assert.equal(report.headcountStart, 3);
    assert.equal(report.headcountEnd, 3);
    assert.equal(report.turnoverRate, 33.3);
  });
  it("groups by department with a fallback key", () => {
    assert.deepEqual(
      report.byDepartment.map((g) => g.key).sort(),
      ["Ops", "Tidak diisi"]
    );
  });
  it("accepts a reversed range", () => {
    const reversed = buildEmployeeMovementReport(rows, "2026-11-30", "2026-11-01");
    assert.equal(reversed.from, "2026-11-01");
    assert.equal(reversed.joined.length, 1);
  });
  it("has no turnover rate for an empty organization", () => {
    assert.equal(buildEmployeeMovementReport([], "2026-11-01", "2026-11-30").turnoverRate, null);
  });
});

describe("org chart", () => {
  const p = (id: string, managerId: string | null, name = id) => ({
    id,
    managerId,
    name,
    employeeNumber: id,
    position: null,
    department: null,
  });
  it("nests reports under their manager and counts descendants", () => {
    const tree = buildOrgChart([p("ceo", null), p("a", "ceo"), p("b", "ceo"), p("c", "a")]);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].descendantCount, 3);
    assert.deepEqual(tree[0].children.map((c) => c.id), ["a", "b"]);
  });
  it("treats unknown managers and self-references as roots", () => {
    const tree = buildOrgChart([p("x", "missing"), p("y", "y")]);
    assert.deepEqual(tree.map((n) => n.id).sort(), ["x", "y"]);
  });
  it("breaks reporting cycles so everyone appears once", () => {
    const tree = buildOrgChart([p("a", "b"), p("b", "a"), p("c", "a")]);
    const ids: string[] = [];
    const walk = (nodes: typeof tree) =>
      nodes.forEach((n) => {
        ids.push(n.id);
        walk(n.children);
      });
    walk(tree);
    assert.deepEqual(ids.sort(), ["a", "b", "c"]);
  });
});

describe("workforce insights", () => {
  const e = (over: Partial<InsightEmployee>): InsightEmployee => ({
    gender: null,
    birthDate: null,
    nik: null,
    birthPlace: null,
    religion: null,
    maritalStatus: null,
    email: null,
    phone: null,
    personalEmail: null,
    position: null,
    department: null,
    workLocationId: null,
    employmentType: null,
    hireDate: null,
    addressCount: 0,
    bankCount: 0,
    hasInsurance: false,
    ...over,
  });
  it("computes completeness per category", () => {
    const result = profileCompleteness([
      e({ nik: "123", phone: "08", email: "a@b.c", bankCount: 1 }),
      e({}),
    ]);
    const byKey = Object.fromEntries(result.categories.map((c) => [c.key, c.percent]));
    assert.equal(byKey.identity, 50);
    assert.equal(byKey.contact, 50);
    assert.equal(byKey.bank, 50);
    assert.equal(byKey.personal, 0);
    assert.ok(result.overall > 0 && result.overall < 50);
  });
  it("handles an empty list", () => {
    assert.equal(profileCompleteness([]).overall, 0);
  });
  it("splits gender in English and Indonesian", () => {
    assert.deepEqual(
      genderSplit([e({ gender: "Male" }), e({ gender: "perempuan" }), e({})]),
      { male: 1, female: 1, unknown: 1 }
    );
  });
  it("computes age with the birthday boundary", () => {
    assert.equal(ageOn("2000-11-18", "2026-11-18"), 26);
    assert.equal(ageOn("2000-11-19", "2026-11-18"), 25);
    const dist = ageDistribution(
      [e({ birthDate: "2005-01-01" }), e({ birthDate: "1960-01-01" }), e({ birthDate: "bad" })],
      "2026-11-18"
    );
    assert.equal(dist.buckets.find((b) => b.label === "< 25")?.value, 1);
    assert.equal(dist.buckets.find((b) => b.label === "55+")?.value, 1);
    assert.equal(dist.unknown, 1);
  });
});
