/**
 * PM-05 — Automated payslip PDF document builder — PURE module.
 *
 * Assembles an Indonesian payslip document model from immutable payroll
 * snapshots and renders it as deterministic PostScript. No IO here: no
 * database, no filesystem, no Ghostscript, no auth. Callers own the record
 * fetching (org-scoped) and the render/encrypt/storage pipeline.
 *
 * Security contract:
 * - Every database/user-derived string is ESCAPED before entering PostScript
 *   (parens, backslash, control characters and non-ASCII are neutralized), so
 *   no database value can inject PostScript instructions.
 * - Content derives ONLY from immutable snapshots (payroll_item snapshots,
 *   payroll_item_component snapshots, payslip fields, period/organization
 *   metadata). Live employee payroll configuration is never consulted, so a
 *   later configuration change can never alter a generated historical payslip.
 * - Rendering is deterministic: identical input always yields identical output.
 */

import { formatIDR, nonNegative } from "./money.ts";

export const PAYSLIP_WATERMARK_TEXT = "CONFIDENTIAL";

function dateLabel(value: Date | null | undefined): string {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

/** Renders one integer IDR amount already formatted via `formatIDR`. */
function labelFor(amount: number): string {
  return formatIDR(nonNegative(Math.trunc(amount ?? 0)));
}

/**
 * Maps a source component row (as read from payroll_item_components) to the
 * plain shape the document model expects.
 */
export interface PayslipPdfSourceComponent {
  code: string;
  name: string;
  /** Snapshot value: "earning" | "deduction". */
  type: string;
  /** Integer IDR magnitude. */
  amount: number;
  notes: string | null;
}

export interface PayslipPdfSourcePeriod {
  code: string;
  name: string;
  periodStart: Date;
  periodEnd: Date;
  paymentDate: Date;
}

export interface PayslipPdfSourceEmployee {
  name: string;
  number: string;
}

export interface PayslipPdfSourcePayslip {
  number: string;
  issuedAt: Date;
}

export interface PayslipPdfSource {
  organizationName: string;
  organizationCode: string;
  period: PayslipPdfSourcePeriod;
  employee: PayslipPdfSourceEmployee;
  payslip: PayslipPdfSourcePayslip;
  grossAmount: number;
  totalDeductions: number;
  netAmount: number;
  components: PayslipPdfSourceComponent[];
}

export interface PayslipPdfComponentLine {
  code: string;
  name: string;
  notes: string | null;
  amountLabel: string;
}

export interface PayslipPdfDocumentModel {
  organizationName: string;
  organizationCode: string;
  periodName: string;
  periodCode: string;
  periodStartLabel: string;
  periodEndLabel: string;
  paymentDateLabel: string;
  employeeName: string;
  employeeNumber: string;
  payslipNumber: string;
  issuedAtLabel: string;
  grossLabel: string;
  earnings: PayslipPdfComponentLine[];
  deductions: PayslipPdfComponentLine[];
  totalDeductionsLabel: string;
  netLabel: string;
}

/**
 * Builds the display document model from immutable snapshot rows.
 *
 * Earnings are components snapshotted with type `earning`; everything else is
 * grouped under deductions (`PENDAPATAN` / `POTONGAN` on the slip).
 */
export function buildPayslipPdfModel(
  source: PayslipPdfSource
): PayslipPdfDocumentModel {
  const earnings = source.components.filter(
    (component) => component.type === "earning"
  );
  const deductions = source.components.filter(
    (component) => component.type !== "earning"
  );

  const toLine = (component: PayslipPdfSourceComponent): PayslipPdfComponentLine =>
    ({
      code: component.code,
      name: component.name,
      notes: component.notes,
      amountLabel: labelFor(component.amount),
    });

  return {
    organizationName: source.organizationName,
    organizationCode: source.organizationCode,
    periodName: source.period.name,
    periodCode: source.period.code,
    periodStartLabel: dateLabel(source.period.periodStart),
    periodEndLabel: dateLabel(source.period.periodEnd),
    paymentDateLabel: dateLabel(source.period.paymentDate),
    employeeName: source.employee.name,
    employeeNumber: source.employee.number,
    payslipNumber: source.payslip.number,
    issuedAtLabel: dateLabel(source.payslip.issuedAt),
    grossLabel: labelFor(source.grossAmount),
    earnings: earnings.map(toLine),
    deductions: deductions.map(toLine),
    totalDeductionsLabel: labelFor(source.totalDeductions),
    netLabel: labelFor(source.netAmount),
  };
}

/**
 * Neutralizes one string for safe embedding in a PostScript literal.
 *
 * - `\`, `(`, `)` are escaped with their PostScript escape forms.
 * - Control characters are dropped.
 * - Printable ASCII passes through unchanged.
 * - Other characters are transliterated to ASCII where a safe mapping exists,
 *   otherwise replaced with `?`. No raw non-ASCII byte is ever emitted, so a
 *   database value can never carry PostScript operators or break out of a
 *   string literal.
 */
export function escapePostScriptString(value: string): string {
  let output = "";

  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;

    if (code <= 0x1f || code === 0x7f) {
      continue;
    }

    if (character === "\\") {
      output += "\\\\";
      continue;
    }

    if (character === "(") {
      output += "\\(";
      continue;
    }

    if (character === ")") {
      output += "\\)";
      continue;
    }

    if (code >= 0x20 && code <= 0x7e) {
      output += character;
      continue;
    }

    output += TRANSLITERATIONS.get(character) ?? "?";
  }

  return output;
}

/** ASCII-safe mappings for the accented/typographic characters common in
 * Indonesian names, addresses and free-text notes. */
const TRANSLITERATIONS = new Map<string, string>([
  ["à", "a"], ["á", "a"], ["â", "a"], ["ã", "a"], ["ä", "a"], ["å", "a"], ["æ", "ae"],
  ["ç", "c"], ["è", "e"], ["é", "e"], ["ê", "e"], ["ë", "e"],
  ["ì", "i"], ["í", "i"], ["î", "i"], ["ï", "i"],
  ["ñ", "n"], ["ò", "o"], ["ó", "o"], ["ô", "o"], ["õ", "o"], ["ö", "o"], ["ø", "o"],
  ["ù", "u"], ["ú", "u"], ["û", "u"], ["ü", "u"],
  ["ý", "y"], ["ÿ", "y"],
  ["À", "A"], ["Á", "A"], ["Â", "A"], ["Ã", "A"], ["Ä", "A"], ["Å", "A"], ["Æ", "AE"],
  ["Ç", "C"], ["È", "E"], ["É", "E"], ["Ê", "E"], ["Ë", "E"],
  ["Ì", "I"], ["Í", "I"], ["Î", "I"], ["Ï", "I"],
  ["Ñ", "N"], ["Ò", "O"], ["Ó", "O"], ["Ô", "O"], ["Õ", "O"], ["Ö", "O"], ["Ø", "O"],
  ["Ù", "U"], ["Ú", "U"], ["Û", "U"], ["Ü", "U"],
  ["Ý", "Y"],
  ["–", "-"], ["—", "-"], ["-", "-"], ["〜", "-"],
  ["‘", "'"], ["’", "'"], ["´", "'"], ["`", "'"],
  ["“", '"'], ["”", '"'],
  ["…", "..."], ["•", "*"], ["·", "*"],
  ["°", " deg"], ["±", "+/-"], ["×", "x"], ["÷", "/"],
]);

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const LEFT_MARGIN = 40;
const RIGHT_EDGE = 555;
const NAME_RIGHT_EDGE = 400;
const ROW_HEIGHT = 16;

function text(s: string): string {
  return `(${escapePostScriptString(s)})`;
}

/**
 * Renders the document model as deterministic A4 PostScript.
 *
 * The returned script is pure data: it runs only server-authored drawing
 * operators and every string is escaped. Ghostscript converts it to a
 * plaintext PDF before the existing encrypt-and-store pipeline.
 */
export function renderPayslipPostScript(model: PayslipPdfDocumentModel): string {
  const lines: string[] = [];

  lines.push("%!PS-Adobe-3.0");
  lines.push(`<< /PageSize [${PAGE_WIDTH} ${PAGE_HEIGHT}] >> setpagedevice`);
  lines.push("/Helvetica findfont 9 scalefont setfont");
  lines.push("/LSHOW { moveto show } def");
  lines.push("/RSHOW { moveto dup stringwidth pop neg 0 rmoveto show } def");
  lines.push("/CSHOW { moveto dup stringwidth pop 2 div neg 0 rmoveto show } def");
  lines.push("/SEG { moveto lineto stroke } def");
  lines.push(
    "/FITW { /y exch def /x exch def /maxw exch def /s exch def " +
      "x y moveto s stringwidth pop maxw le { s show } " +
      "{ /found false def /n s length def /i n 1 sub def " +
      "{ i 0 le { exit } if s 0 i getinterval stringwidth pop maxw le " +
      "{ /found true def exit } if /i i 1 sub def } loop " +
      "found { s 0 i getinterval show (\u2026) show } { (\u2026) show } ifelse } ifelse } def"
  );

  // Watermark is drawn first so the slip content renders on top of it.
  lines.push("gsave");
  lines.push("0.92 setgray");
  lines.push("/Helvetica-Bold findfont 54 scalefont setfont");
  lines.push(`${PAGE_WIDTH / 2} ${PAGE_HEIGHT / 2} translate`);
  lines.push("45 rotate");
  lines.push(
    `${text(PAYSLIP_WATERMARK_TEXT)} 0 0 moveto dup stringwidth pop 2 div neg 0 rmoveto show`
  );
  lines.push("grestore");
  lines.push("0 setgray");

  // ------------------------------------------------------------------ header
  lines.push("/Helvetica-Bold findfont 12 scalefont setfont");
  lines.push(`${text(model.organizationName)} ${LEFT_MARGIN} 792 LSHOW`);
  lines.push(`/Helvetica findfont 9 scalefont setfont`);
  lines.push(`${text(model.organizationCode)} ${RIGHT_EDGE} 792 RSHOW`);

  lines.push(`/Helvetica-Bold findfont 18 scalefont setfont`);
  lines.push(`${text("SLIP GAJI")} ${PAGE_WIDTH / 2} 758 CSHOW`);

  lines.push(`/Helvetica findfont 10 scalefont setfont`);
  lines.push(`${LEFT_MARGIN} 726 ${RIGHT_EDGE} 726 SEG`);

  lines.push(`${text(`Periode: ${model.periodName} (${model.periodCode})`)} ${LEFT_MARGIN} 704 LSHOW`);
  lines.push(`${text(`Periode: ${model.periodStartLabel}  s/d  ${model.periodEndLabel}`)} ${LEFT_MARGIN} 688 LSHOW`);
  lines.push(`${text(`Tanggal bayar: ${model.paymentDateLabel}`)} ${LEFT_MARGIN} 672 LSHOW`);
  lines.push(`${text(`Diterbitkan: ${model.issuedAtLabel}`)} ${LEFT_MARGIN} 656 LSHOW`);
  lines.push(`${text(`No. Slip: ${model.payslipNumber}`)} ${RIGHT_EDGE} 656 RSHOW`);

  lines.push(`${LEFT_MARGIN} 642 ${RIGHT_EDGE} 642 SEG`);

  lines.push(`/Helvetica-Bold findfont 11 scalefont setfont`);
  lines.push(`${text(`NIP: ${model.employeeNumber}`)} ${LEFT_MARGIN} 622 LSHOW`);
  lines.push(`${text(model.employeeName)} ${LEFT_MARGIN} 606 LSHOW`);

  lines.push(`${LEFT_MARGIN} 594 ${RIGHT_EDGE} 594 SEG`);

  // ------------------------------------------------------------------ body
  let y = 574;

  y = pushSectionHeader(lines, "PENDAPATAN", y);
  y = pushColumnHeader(lines, y);
  for (const line of model.earnings) {
    y = pushComponentLine(lines, line, y);
  }
  y -= 6;
  y = pushTotalRow(lines, "TOTAL PENGHASILAN (GROSS)", model.grossLabel, y, 11);

  if (model.deductions.length > 0) {
    y -= 18;
    y = pushSectionHeader(lines, "POTONGAN", y);
    y = pushColumnHeader(lines, y);
    for (const line of model.deductions) {
      y = pushComponentLine(lines, line, y);
    }
    y -= 6;
    y = pushTotalRow(lines, "TOTAL POTONGAN", model.totalDeductionsLabel, y, 11);
  }

  lines.push(`${LEFT_MARGIN} ${y} ${RIGHT_EDGE} ${y} SEG`);

  y -= 24;
  lines.push(`/Helvetica-Bold findfont 13 scalefont setfont`);
  lines.push(`${text("GAJI BERSIH (NET)")} ${LEFT_MARGIN} ${y} LSHOW`);
  lines.push(`${text(model.netLabel)} ${RIGHT_EDGE} ${y} RSHOW`);

  lines.push("showpage");
  lines.push("%%EOF");

  return lines.join("\n");
}

function pushSectionHeader(
  lines: string[],
  title: string,
  y: number
): number {
  const current = y;
  lines.push(`/Helvetica-Bold findfont 11 scalefont setfont`);
  lines.push(`${text(title)} ${LEFT_MARGIN} ${current} LSHOW`);
  return current - ROW_HEIGHT;
}

function pushColumnHeader(lines: string[], y: number): number {
  const current = y;
  lines.push(`/Helvetica-Bold findfont 9 scalefont setfont`);
  lines.push(`${text("Komponen")} ${LEFT_MARGIN} ${current} LSHOW`);
  lines.push(`${text("Jumlah")} ${RIGHT_EDGE} ${current} RSHOW`);
  lines.push(`${LEFT_MARGIN} ${current - 4} ${RIGHT_EDGE} ${current - 4} SEG`);
  lines.push(`/Helvetica findfont 9 scalefont setfont`);
  return current - ROW_HEIGHT;
}

function pushComponentLine(
  lines: string[],
  line: PayslipPdfComponentLine,
  y: number
): number {
  const current = y;
  const maxWidth = NAME_RIGHT_EDGE - LEFT_MARGIN;
  lines.push(`/Helvetica findfont 9 scalefont setfont`);
  lines.push(`${text(line.name)} ${maxWidth} ${LEFT_MARGIN} ${current} FITW`);
  lines.push(`/Helvetica findfont 9 scalefont setfont`);
  lines.push(`${text(line.amountLabel)} ${RIGHT_EDGE} ${current} RSHOW`);
  if (line.notes) {
    lines.push(`/Helvetica-Oblique findfont 8 scalefont setfont`);
    lines.push(
      `${text(`Catatan: ${line.notes}`)} ${maxWidth} ${LEFT_MARGIN} ${current - 11} FITW`
    );
  }
  return current - (line.notes ? ROW_HEIGHT + 4 : ROW_HEIGHT);
}

function pushTotalRow(
  lines: string[],
  label: string,
  amountLabel: string,
  y: number,
  fontSize: number
): number {
  const current = y;
  lines.push(`/Helvetica-Bold findfont ${fontSize} scalefont setfont`);
  lines.push(`${text(label)} ${LEFT_MARGIN} ${current} LSHOW`);
  lines.push(`${text(amountLabel)} ${RIGHT_EDGE} ${current} RSHOW`);
  return current - ROW_HEIGHT;
}

/**
 * Convenience: model + PostScript in one pure call.
 */
export function buildPayslipPostScript(source: PayslipPdfSource): string {
  return renderPayslipPostScript(buildPayslipPdfModel(source));
}