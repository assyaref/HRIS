import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import {
  contractMonths,
  formatDocumentNumber,
  numberingPeriod,
  romanMonth,
  terbilang,
  validateNumberFormat,
} from "../../features/documents/numbering.ts";
import { longDate, parsePkwtContent, rupiah } from "../../features/documents/pkwt.ts";

describe("letter numbering", () => {
  it("formats numbers from tokens", () => {
    assert.equal(
      formatDocumentNumber("{seq}/{code}/HRD/{roman}/{year}", { sequence: 7, padding: 3, code: "SK", issuedDate: "2026-11-19" }),
      "007/SK/HRD/XI/2026"
    );
    assert.equal(
      formatDocumentNumber("{code}-{yy}{month}-{seq}", { sequence: 12, padding: 4, code: "PKWT", issuedDate: "2026-02-01" }),
      "PKWT-2602-0012"
    );
    assert.equal(romanMonth(4), "IV");
  });

  it("validates formats", () => {
    assert.equal(validateNumberFormat("{seq}/SK/{year}"), null);
    assert.match(validateNumberFormat("SK/{year}") ?? "", /\{seq\}/);
    assert.match(validateNumberFormat("{seq}/{bulan}") ?? "", /tidak dikenal/);
    assert.match(validateNumberFormat("{seq}/{year") ?? "", /Kurung/);
  });

  it("derives the numbering period from the reset rule", () => {
    assert.equal(numberingPeriod("yearly", "2026-11-19"), "2026");
    assert.equal(numberingPeriod("monthly", "2026-11-19"), "2026-11");
    assert.equal(numberingPeriod("never", "2026-11-19"), "all");
  });

  it("counts contract months with an inclusive end date", () => {
    assert.equal(contractMonths("2026-01-01", "2026-12-31"), 12);
    assert.equal(contractMonths("2026-01-15", "2026-07-14"), 6);
    assert.equal(contractMonths("2026-11-19", "2027-11-18"), 12);
    assert.equal(contractMonths("2026-01-31", "2026-02-27"), 0);
  });

  it("spells numbers in Indonesian", () => {
    assert.equal(terbilang(12), "dua belas");
    assert.equal(terbilang(1_500_000), "satu juta lima ratus ribu");
    assert.equal(terbilang(5_250_000), "lima juta dua ratus lima puluh ribu");
    assert.equal(terbilang(111), "seratus sebelas");
  });
});

describe("PKWT content", () => {
  it("parses only valid PKWT snapshots", () => {
    assert.equal(parsePkwtContent(null), null);
    assert.equal(parsePkwtContent({ kind: "other" }), null);
    const parsed = parsePkwtContent({
      kind: "pkwt",
      employee: { name: "Ani", employeeNumber: "E1" },
      position: "Operator",
      workLocation: "Jakarta",
      contractStart: "2026-01-01",
      contractEnd: "2026-12-31",
      salary: 5000000,
      signatoryName: "Budi",
      signatoryTitle: "HR",
      city: "Jakarta",
    });
    assert.equal(parsed?.employee.nik, null);
    assert.equal(parsed?.salary, 5000000);
    assert.equal(longDate("2026-11-19"), "19 November 2026");
    assert.equal(rupiah(5000000), "Rp 5.000.000");
  });
});

describe("migration 0027 (documents) is additive and RESTRICT-only", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0027_documents.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  const NEW = ["document_types", "issued_documents"];

  it("creates only the two tables", () => {
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]).sort(), [...NEW].sort());
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.ok(NEW.includes(m[1]), m[1]);
    for (const m of sql.matchAll(/INDEX "\w+" ON "(\w+)"/g)) assert.ok(NEW.includes(m[1]), m[1]);
    assert.doesNotMatch(sql, /DROP /);
    assert.deepEqual(
      [...sql.matchAll(/REFERENCES "public"\."employees"\("id"\) ON DELETE (\w+)/g)].map((m) => m[1]),
      ["restrict"]
    );
    assert.match(sql, /issued_documents_type_period_seq_unique/);
    assert.match(sql, /issued_documents_org_number_unique/);
  });

  it("is journaled with a fresh, increasing when", () => {
    const at = journal.entries.findIndex((e) => e.tag === "0027_documents");
    assert.ok(at > 0);
    assert.equal(journal.entries[at].idx, journal.entries[at - 1].idx + 1);
    assert.ok(journal.entries[at].when > journal.entries[at - 1].when);
  });

  it("deletion plans register issued letters as optional", () => {
    for (const p of ["features/employees/queries.ts", "features/employees/test-data-purge.queries.ts"]) {
      assert.match(readFileSync(join(root, p), "utf8"), /optionalTable: "issued_documents"/);
    }
  });
});

describe("documents guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const read = (p: string) => readFileSync(join(root, p), "utf8");

  it("issues numbers under a row lock and checks permissions", () => {
    const actions = read("features/documents/actions.ts");
    assert.match(actions, /^"use server";/);
    assert.match(actions, /FOR UPDATE/);
    assert.match(actions, /const MANAGE = \[PERMISSIONS\.EMPLOYEES_VIEW, PERMISSIONS\.EMPLOYEES_DOCUMENT_UPLOAD\]/);
    assert.match(actions, /context\(\[\.\.\.MANAGE, PERMISSIONS\.EMPLOYEES_EMPLOYMENT_VIEW\]\)/);
    assert.match(actions, /data\.updateEmployee && !can\(ctx, PERMISSIONS\.EMPLOYEES_EMPLOYMENT_UPDATE\)/);
    for (const name of [...actions.matchAll(/export async function (\w+)/g)].map((m) => m[1])) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(body, /await context\(/, name);
    }
  });

  it("pages and nav agree on view permissions", () => {
    for (const p of ["app/(dashboard)/documents/page.tsx", "app/(dashboard)/documents/[documentId]/page.tsx"]) {
      const page = read(p);
      assert.match(page, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_VIEW\)/);
      assert.match(page, /requirePermission\(user\.id, PERMISSIONS\.EMPLOYEES_DOCUMENT_VIEW\)/);
      assert.match(page, /isDocumentsModuleReady\(\)/);
    }
    const nav = read("components/layout/navigation.ts");
    const at = nav.indexOf('href: "/documents"');
    const entry = nav.slice(at, nav.indexOf("}", at));
    assert.match(entry, /permission: PERMISSIONS\.EMPLOYEES_DOCUMENT_VIEW/);
    assert.match(entry, /anyPermission: \[PERMISSIONS\.EMPLOYEES_VIEW\]/);
  });
});
