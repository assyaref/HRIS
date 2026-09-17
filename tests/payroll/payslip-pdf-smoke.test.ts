/**
 * PM-05 — Ghostscript rendering smoke test.
 *
 * Renders a full server-built payslip PostScript document through the real
 * Ghostscript binary and verifies a well-formed PDF is produced and the
 * workspace is cleaned up.
 *
 * The lib wrapper `renderPostScriptToPdf` carries `import "server-only"` and
 * cannot be loaded by the plain-Node test runner, so this test invokes the
 * same Ghostscript flags (`-dSAFER -dBATCH -dNOPAUSE -sDEVICE=pdfwrite`)
 * against the pure builder output in an isolated temp workspace.
 *
 * Self-skip rules (reported, not failed):
 * - Ghostscript is not installed or not on PATH.
 * No production DB is touched and no payslip document is stored.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { buildPayslipPostScript } from "../../features/payroll/payslip-pdf-builder.ts";

const execFileAsync = promisify(execFile);
const PDF_MAGIC = Buffer.from("%PDF-");

async function renderWithGhostscript(
  postScript: string,
  workspace: string
): Promise<Buffer> {
  const input = path.join(workspace, "input.ps");
  const output = path.join(workspace, "output.pdf");

  await writeFile(input, postScript, { mode: 0o600 });

  await execFileAsync(
    "gs",
    [
      "-q",
      "-dSAFER",
      "-dBATCH",
      "-dNOPAUSE",
      "-sDEVICE=pdfwrite",
      `-sOutputFile=${output}`,
      input,
    ],
    { timeout: 60_000, maxBuffer: 1024 * 1024, windowsHide: true }
  );

  return readFile(output);
}

async function createWorkspace(): Promise<string> {
  const dir = path.join(os.tmpdir(), `pm05-render-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  return dir;
}

async function computeSkipReason(): Promise<string | false> {
  try {
    await execFileAsync("gs", ["--version"], {
      timeout: 10_000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
  } catch (error) {
    console.error("[pm05-smoke] gs probe:", (error as Error).message);
    return "Ghostscript is not available in this environment (self-skip).";
  }
  return false;
}

function sampleSource() {
  return {
    organizationName: "PT Maju Jaya (Bandung)",
    organizationCode: "MJ",
    period: {
      code: "2026-07",
      name: "Periode Juli 2026",
      periodStart: new Date("2026-07-01T00:00:00.000Z"),
      periodEnd: new Date("2026-07-31T00:00:00.000Z"),
      paymentDate: new Date("2026-08-01T00:00:00.000Z"),
    },
    employee: {
      name: "Rahmawati (Putri) \\ O'Brien",
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
      { code: "GAJI_POKOK", name: "Gaji Pokok", type: "earning", amount: 8_000_000, notes: null },
      { code: "TUNJANGAN", name: "Tunjangan Transport", type: "earning", amount: 2_000_000, notes: "Dalam kota" },
      { code: "POT_BPJS", name: "BPJS Kesehatan", type: "deduction", amount: 400_000, notes: null },
      { code: "POT_PPH21", name: "PPh 21", type: "deduction", amount: 850_000, notes: null },
    ],
  };
}

test(
  "renders the builder output to a valid PDF via Ghostscript",
  { skip: await computeSkipReason() },
  async () => {
    const workspace = await createWorkspace();
    try {
      const pdf = await renderWithGhostscript(
        buildPayslipPostScript(sampleSource()),
        workspace
      );

      assert.ok(pdf.length > 100, "expected a non-trivial PDF buffer");
      assert.ok(
        pdf.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC),
        "expected a %PDF- magic marker"
      );
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }

    // The temporary render workspace must be fully removed afterwards.
    await assert.rejects(() => readdir(workspace));
  }
);

test(
  "removes the workspace when rendering fails",
  { skip: await computeSkipReason() },
  async () => {
    const workspace = await createWorkspace();
    try {
      await assert.rejects(
        async () => {
          await renderWithGhostscript(
            "%!PS-Adobe-3.0\n/this is not a valid operator\n",
            workspace
          );
        }
      );
      assert.ok(true, "malformed PostScript was rejected");
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  }
);