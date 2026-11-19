import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

import { parseLetterContent } from "../../features/documents/pkwt.ts";
import {
  DEFAULT_TEMPLATES,
  paragraphs,
  placeholdersOf,
  promptedFields,
  renderTemplate,
  SAMPLE_VALUES,
  validateTemplateBody,
} from "../../features/documents/templates.ts";

describe("letter templates", () => {
  it("validates placeholders and braces", () => {
    assert.equal(validateTemplateBody("Dengan ini menerangkan {{nama}} bekerja di {{perusahaan}}."), null);
    assert.match(validateTemplateBody("Dengan ini menerangkan {{gaji}} karyawan kami.") ?? "", /\{\{gaji\}\}/);
    assert.match(validateTemplateBody("Dengan ini menerangkan {{nama} karyawan kami.") ?? "", /tidak lengkap/);
    assert.match(validateTemplateBody("pendek") ?? "", /minimal/);
  });

  it("renders values, empty as a dash, and never HTML", () => {
    const text = renderTemplate("Nama: {{nama}}\nNIK: {{ nik }}\n\nJabatan {{jabatan}}", { nama: "<b>Ani</b>", nik: "" });
    assert.equal(text, "Nama: <b>Ani</b>\nNIK: —\n\nJabatan —");
    assert.deepEqual(paragraphs(text), ["Nama: <b>Ani</b>\nNIK: —", "Jabatan —"]);
  });

  it("detects fields typed at generation time", () => {
    assert.deepEqual(promptedFields("{{tanggal_selesai}} {{keterangan}} {{nama}}"), ["keterangan", "tanggal_selesai"]);
    assert.deepEqual(placeholdersOf("{{nama}} {{nama}} {{nik}}"), ["nama", "nik"]);
  });

  it("ships valid default templates for existing default types", () => {
    const codes = new Set(["PKWT", "SK", "SKK", "SP", "ST"]);
    assert.ok(DEFAULT_TEMPLATES.length >= 6);
    for (const t of DEFAULT_TEMPLATES) {
      assert.equal(validateTemplateBody(t.body), null, t.name);
      assert.ok(codes.has(t.typeCode), t.typeCode);
      assert.doesNotMatch(renderTemplate(t.body, SAMPLE_VALUES), /\{\{/);
    }
    assert.equal(new Set(DEFAULT_TEMPLATES.map((t) => t.name)).size, DEFAULT_TEMPLATES.length);
  });

  it("parses stored letter content safely", () => {
    assert.equal(parseLetterContent({ kind: "pkwt" }), null);
    const letter = parseLetterContent({ kind: "letter", title: "SURAT", paragraphs: ["a", 1, "b"], signatoryName: "X" });
    assert.deepEqual(letter?.paragraphs, ["a", "b"]);
  });
});

describe("migration 0028 (letter templates)", () => {
  const root = join(import.meta.dirname, "..", "..");
  const sql = readFileSync(join(root, "db/migrations/0028_letter_templates.sql"), "utf8");
  const journal = JSON.parse(readFileSync(join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
    entries: { idx: number; when: number; tag: string }[];
  };
  it("creates only letter_templates, without an employee reference", () => {
    assert.deepEqual([...sql.matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]), ["letter_templates"]);
    for (const m of sql.matchAll(/ALTER TABLE "(\w+)"/g)) assert.equal(m[1], "letter_templates");
    assert.doesNotMatch(sql, /"employees"/);
    assert.doesNotMatch(sql, /DROP /);
  });
  it("is journaled last", () => {
    const last = journal.entries.at(-1)!;
    assert.equal(last.tag, "0028_letter_templates");
    assert.equal(last.idx, journal.entries.at(-2)!.idx + 1);
    assert.ok(last.when > journal.entries.at(-2)!.when);
  });
});

describe("letter template guards", () => {
  const root = join(import.meta.dirname, "..", "..");
  const actions = readFileSync(join(root, "features/documents/actions.ts"), "utf8");
  it("template and letter actions need document upload rights and readiness", () => {
    for (const name of ["saveLetterTemplateAction", "setLetterTemplateActiveAction", "seedLetterTemplatesAction", "generateLetterAction"]) {
      const body = actions.slice(actions.indexOf(`export async function ${name}`)).split("\nexport ")[0];
      assert.match(body, /await context\(MANAGE\)/, name);
      assert.match(body, /isLetterTemplatesReady\(\)/, name);
    }
    assert.match(actions, /validateTemplateBody\(parsed\.data\.body\)/);
  });
});
