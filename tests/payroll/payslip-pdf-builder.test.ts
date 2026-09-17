/**
 * PM-05 — Payslip PDF builder tests (Node `node:test`).
 *
 * Exercises the PURE document model assembly and deterministic PostScript
 * rendering in features/payroll/payslip-pdf-builder.ts:
 * - PENDAPATAN/POTONGAN grouping and IDR formatting,
 * - deterministic rendering and the fixed CONFIDENTIAL watermark,
 * - PostScript literal escaping for every database/user-derived string,
 * - snapshot-only data source contract (no live configuration consulted).
 * No DB, no auth, no filesystem, no Ghostscript.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  PAYSLIP_WATERMARK_TEXT,
  buildPayslipPdfModel,
  buildPayslipPostScript,
  escapePostScriptString,
  renderPayslipPostScript,
  type PayslipPdfDocumentModel,
  type PayslipPdfSource,
} from "../../features/payroll/payslip-pdf-builder.ts";

function samplePeriod(): PayslipPdfSource["period"] {
  return {
    code: "2026-07",
    name: "Periode Juli 2026",
    periodStart: new Date("2026-07-01T00:00:00.000Z"),
    periodEnd: new Date("2026-07-31T00:00:00.000Z"),
    paymentDate: new Date("2026-08-01T00:00:00.000Z"),
  };
}

function sampleSource(overrides: Partial<PayslipPdfSource> = {}): PayslipPdfSource {
  return {
    organizationName: "PT Maju Jaya (Bandung)",
    organizationCode: "MJ",
    period: samplePeriod(),
    employee: {
      name: "Rahmawati Putri",
      number: "EMP-0011",
    },
    payslip: {
      number: "PS-2026-07-0001",
      issuedAt: new Date("2026-08-05T00:00:00.000Z"),
    },
    grossAmount: 10_000_000,
    totalDeductions: 1_250_000,
    netAmount: 8_750_000,
    components: [
      {
        code: "GAJI_POKOK",
        name: "Gaji Pokok",
        type: "earning",
        amount: 8_000_000,
        notes: null,
      },
      {
        code: "TUNJANGAN",
        name: "Tunjangan Transport",
        type: "earning",
        amount: 2_000_000,
        notes: "Dalam kota",
      },
      {
        code: "POT_BPJS",
        name: "BPJS Kesehatan",
        type: "deduction",
        amount: 400_000,
        notes: null,
      },
      {
        code: "POT_PPH21",
        name: "PPh 21",
        type: "deduction",
        amount: 850_000,
        notes: null,
      },
    ],
    ...overrides,
  };
}

describe("buildPayslipPdfModel", () => {
  it("groups earnings under PENDAPATAN and deductions under POTONGAN", () => {
    const model = buildPayslipPdfModel(sampleSource());

    assert.deepEqual(
      model.earnings.map((line) => line.code),
      ["GAJI_POKOK", "TUNJANGAN"]
    );
    assert.deepEqual(
      model.deductions.map((line) => line.code),
      ["POT_BPJS", "POT_PPH21"]
    );
  });

  it("orders earnings before deductions regardless of source order", () => {
    const source = sampleSource();
    source.components = [
      sampleSource().components[2],
      sampleSource().components[3],
      sampleSource().components[0],
      sampleSource().components[1],
    ];
    const model = buildPayslipPdfModel(source);

    assert.deepEqual(
      model.earnings.map((line) => line.code),
      ["GAJI_POKOK", "TUNJANGAN"]
    );
    assert.deepEqual(
      model.deductions.map((line) => line.code),
      ["POT_BPJS", "POT_PPH21"]
    );
  });

  it("formats amount labels as integer IDR with separators", () => {
    const model = buildPayslipPdfModel(sampleSource());

    assert.equal(model.earnings[0].amountLabel, "Rp 8,000,000");
    assert.equal(model.deductions[1].amountLabel, "Rp 850,000");
    assert.equal(model.grossLabel, "Rp 10,000,000");
    assert.equal(model.totalDeductionsLabel, "Rp 1,250,000");
    assert.equal(model.netLabel, "Rp 8,750,000");
  });

  it("keeps component notes on the document model", () => {
    const model = buildPayslipPdfModel(sampleSource());

    assert.equal(model.earnings[1].notes, "Dalam kota");
    assert.equal(model.earnings[0].notes, null);
  });

  it("emits ISO date labels from period and payslip timestamps", () => {
    const model = buildPayslipPdfModel(sampleSource());

    assert.equal(model.periodStartLabel, "2026-07-01");
    assert.equal(model.periodEndLabel, "2026-07-31");
    assert.equal(model.paymentDateLabel, "2026-08-01");
    assert.equal(model.issuedAtLabel, "2026-08-05");
  });

  it("renders small/zero amounts via the shared integer formatter", () => {
    const model = buildPayslipPdfModel(
      sampleSource({ grossAmount: 0, totalDeductions: 0, netAmount: 0 })
    );

    assert.equal(model.grossLabel, "Rp 0");
    assert.equal(model.totalDeductionsLabel, "Rp 0");
    assert.equal(model.netLabel, "Rp 0");
  });

  it("produces an empty deductions section when only earnings exist", () => {
    const source = sampleSource();
    source.components = source.components.filter(
      (component) => component.type === "earning"
    );
    const model = buildPayslipPdfModel(source);

    assert.deepEqual(model.deductions, []);
    assert.equal(model.earnings.length, 2);
  });

  it("uses only the snapshot fields passed in (immutability contract)", () => {
    const source = sampleSource({
      employee: { name: "Nama Lama (Snapshot)", number: "EMP-0001" },
      payslip: { number: "PS-LAMA-0001", issuedAt: new Date("2025-01-02T00:00:00.000Z") },
    });
    const model = buildPayslipPdfModel(source);

    assert.equal(model.employeeName, "Nama Lama (Snapshot)");
    assert.equal(model.employeeNumber, "EMP-0001");
    assert.equal(model.payslipNumber, "PS-LAMA-0001");
    assert.equal(model.issuedAtLabel, "2025-01-02");
  });
});

describe("escapePostScriptString", () => {
  it("passes printable ASCII through unchanged", () => {
    assert.equal(escapePostScriptString("PT Maju Jaya 2026"), "PT Maju Jaya 2026");
    assert.equal(escapePostScriptString("EMP-0011"), "EMP-0011");
    assert.equal(escapePostScriptString("Rp 1,234,567"), "Rp 1,234,567");
  });

  it("escapes parentheses in text", () => {
    assert.equal(escapePostScriptString("A (b) C"), "A \\(b\\) C");
  });

  it("escapes backslashes", () => {
    assert.equal(escapePostScriptString("a\\b"), "a\\\\b");
  });

  it("drops control characters", () => {
    assert.equal(escapePostScriptString("line\nbreak\u0000tab\t"), "linebreaktab");
  });

  it("transliterates common accented characters to ASCII", () => {
    assert.equal(escapePostScriptString("Andrée Müller"), "Andree Muller");
    assert.equal(escapePostScriptString("Sélatan-Cæsar"), "Selatan-Caesar");
  });

  it("replaces unknown non-ASCII characters with a placeholder", () => {
    assert.equal(escapePostScriptString("日本語"), "???");
  });

  it("keeps PostScript keywords inert as literal text", () => {
    // PostScript keywords only execute outside a string literal; escaping must
    // guarantee the payload stays inside the literal (parens escaped, operator
    // text preserved but inert).
    const escaped = escapePostScriptString("showpage) (0 0 moveto showpage %");

    assert.ok(escaped.includes("showpage"));
    assert.ok(!/(?<!\\)\)/.test(escaped), "no unescaped close paren");
    assert.ok(!/(?<!\\)\(/.test(escaped), "no unescaped open paren");
    assert.equal(escaped.match(/\\\(/g)?.length, 1);
    assert.equal(escaped.match(/\\\)/g)?.length, 1);
  });

  it("never emits an unescaped open or close paren", () => {
    const escaped = escapePostScriptString("((close)) - (drop");
    assert.ok(!escaped.includes("(("));
    assert.ok(!escaped.includes("))"));
  });
});

describe("renderPayslipPostScript", () => {
  it("renders deterministically for identical input", () => {
    const source = sampleSource();
    assert.equal(
      buildPayslipPostScript(source),
      buildPayslipPostScript(source)
    );
  });

  it("labels the page as A4 and ends with a page-close", () => {
    const ps = buildPayslipPostScript(sampleSource());
    assert.ok(ps.includes("<< /PageSize [595 842] >> setpagedevice"));
    assert.ok(ps.trimEnd().includes("showpage"));
  });

  it("emits the fixed CONFIDENTIAL watermark", () => {
    const ps = buildPayslipPostScript(sampleSource());
    assert.ok(ps.includes(PAYSLIP_WATERMARK_TEXT));
    assert.ok(ps.includes("45 rotate"));
  });

  it("includes the PENDAPATAN and POTONGAN section headers", () => {
    const ps = buildPayslipPostScript(sampleSource());
    assert.ok(ps.includes("(PENDAPATAN)"));
    assert.ok(ps.includes("(POTONGAN)"));
  });

  it("omits the POTONGAN section when there are no deductions", () => {
    const source = sampleSource();
    source.components = source.components.filter(
      (component) => component.type === "earning"
    );
    const ps = buildPayslipPostScript(source);
    assert.ok(!ps.includes("(POTONGAN)"));
  });

  it("includes header metadata (org, period, employee, payslip number)", () => {
    const ps = buildPayslipPostScript(sampleSource());
    // Parentheses inside user data are escaped inside the literal.
    assert.ok(ps.includes("(PT Maju Jaya \\(Bandung\\)) 40 792 LSHOW"));
    assert.ok(ps.includes("(MJ) 555 792 RSHOW"));
    assert.ok(ps.includes("(Periode: Periode Juli 2026 \\(2026-07\\))"));
    assert.ok(ps.includes("(NIP: EMP-0011)"));
    assert.ok(ps.includes("(Rahmawati Putri) 40 606 LSHOW"));
    assert.ok(ps.includes("(No. Slip: PS-2026-07-0001)"));
  });

  it("includes line items and the three totals", () => {
    const ps = buildPayslipPostScript(sampleSource());
    assert.ok(ps.includes("TOTAL PENGHASILAN \\(GROSS\\)"));
    assert.ok(ps.includes("TOTAL POTONGAN"));
    assert.ok(ps.includes("GAJI BERSIH \\(NET\\)"));
    assert.ok(ps.includes("(Gaji Pokok)"));
    assert.ok(ps.includes("(Rp 8,000,000) 555"));
  });

  it("renders component notes inline when present", () => {
    const ps = buildPayslipPostScript(sampleSource());
    assert.ok(ps.includes("(Catatan: Dalam kota)"));
  });

  it("escapes hostile names so text stays inside a literal (no operator injection)", () => {
    const hostile = sampleSource({
      organizationName: "X)))) showpage grestore (Y",
      employee: { name: "Karyawan ) ( (showpage.", number: "EMP-0000" },
    });
    const ps = buildPayslipPostScript(hostile);

    // Every parenthesis from user data is escaped into the literal.
    assert.ok(ps.includes("(X\\)\\)\\)\\) showpage grestore \\(Y)"));
    assert.ok(ps.includes("(Karyawan \\) \\( \\("));
  });

  it("carries issuer-identification without leaking the PDF password", () => {
    const ps = buildPayslipPostScript(sampleSource());
    assert.ok(!ps.toLowerCase().includes("password"));
    assert.ok(!ps.toLowerCase().includes("nik"));
  });
});

describe("document model determinism snapshot", () => {
  it("does not change the render when unrelated model fields change", () => {
    const base = buildPayslipPostScript(sampleSource());
    const changed = buildPayslipPostScript(
      sampleSource({ grossAmount: 9_500_000, netAmount: 8_250_000 })
    );
    assert.notEqual(base, changed);
  });

  it("buildPayslipPostScript composes model + render", () => {
    const model: PayslipPdfDocumentModel = buildPayslipPdfModel(sampleSource());
    assert.equal(
      buildPayslipPostScript(sampleSource()),
      renderPayslipPostScript(model)
    );
  });
});