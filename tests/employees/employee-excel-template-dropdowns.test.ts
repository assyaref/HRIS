/**
 * Excel template dynamic dropdowns (Employee Master Data 2.0).
 *
 * The template must generate in-cell list validation for select/radio/
 * multiselect custom fields straight from the field definitions (single
 * source of truth) — no hard-coded option lists — while preserving the
 * existing core dropdowns and the historical label-only call form.
 *
 * Validation assertions read the WRITTEN workbook (exceljs parse round-trip),
 * so the dropdowns are proven to exist in the actual .xlsx output.
 */

import assert from "node:assert/strict";
import test from "node:test";

import ExcelJS from "exceljs";

import { buildTemplateWorkbook } from "../../features/employees/excel/template.ts";
import {
  CUSTOM_FIELDS_SHEET_NAME,
  EMPLOYEE_SHEET_NAME,
} from "../../features/employees/excel/columns.ts";

async function workbookFrom(buffer: ExcelJS.Buffer): Promise<ExcelJS.Workbook> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
  return workbook;
}

function validationSource(worksheet: ExcelJS.Worksheet, letter: string): string {
  const dataValidations = (
    worksheet as unknown as {
      dataValidations?: { model?: Record<string, { formulae?: string[] }> };
    }
  ).dataValidations;
  const model = dataValidations?.model ?? {};
  // exceljs expands a written `B2:B500` range into per-cell keys (`B2`...) on
  // reload, so the first data row is the canonical lookup; older builds kept
  // the range key, so fall back to any key that starts with the column+2.
  const direct = model[`${letter}2`];
  if (direct) return direct.formulae?.[0] ?? "";
  for (const key of Object.keys(model)) {
    if (key.startsWith(`${letter}2:`)) {
      return model[key]?.formulae?.[0] ?? "";
    }
  }
  return "";
}

test("template: select custom field gets a dropdown referencing the hidden _Lists sheet", async () => {
  const { buffer } = await buildTemplateWorkbook({
    customFields: [
      {
        fieldKey: "shirt_size",
        label: "Shirt Size",
        fieldType: "select",
        options: ["S", "M", "L", "XL", "XXL"],
      },
    ],
  });
  const workbook = await workbookFrom(buffer);
  const custom = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  assert.ok(custom);
  // Header is dynamic (column 2 after Employee No.).
  assert.equal(custom?.getRow(1).getCell(2).text, "Shirt Size [shirt_size]");
  const source = validationSource(custom!, "B");
  assert.match(source, /_Lists/);
  assert.match(source, /\$B\$1:\$B\$5/);

  // The hidden sheet stores the exact options in order.
  const lists = workbook.getWorksheet("_Lists");
  assert.ok(lists, "hidden _Lists sheet is missing");
  assert.equal(lists!.state, "hidden");
  assert.deepEqual(
    [1, 2, 3, 4, 5].map((row) => lists!.getCell(`B${row}`).value),
    ["S", "M", "L", "XL", "XXL"]
  );
});

test("template: radio and multiselect fields also get dropdowns; text does not", async () => {
  const { buffer } = await buildTemplateWorkbook({
    customFields: [
      { label: "Radio", fieldType: "radio", options: ["A", "B"] },
      { label: "Text", fieldType: "text", options: [] },
      { label: "Multi", fieldType: "multiselect", options: ["X", "Y"] },
    ],
  });
  const workbook = await workbookFrom(buffer);
  const custom = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME)!;
  assert.match(validationSource(custom, "B"), /_Lists/); // Radio (col 2)
  assert.equal(validationSource(custom, "C"), ""); // Text (col 3)
  assert.match(validationSource(custom, "D"), /_Lists/); // Multi (col 4)

  // Long-option safety: 60 options never break the validation (the inline
  // literal form would overflow Excel's 255-char list limit).
  const many = Array.from({ length: 60 }, (_, index) => `Option ${index}`);
  const wideResult = await buildTemplateWorkbook({
    customFields: [{ label: "Many", fieldType: "select", options: many }],
  });
  const wideWorkbook = await workbookFrom(wideResult.buffer);
  const wide = wideWorkbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME)!;
  assert.match(validationSource(wide, "B"), /_Lists/);
  const lists = wideWorkbook.getWorksheet("_Lists")!;
  assert.equal(lists.getCell("B60").value, "Option 59");
});

test("template: legacy labels-only options keep rendering headers without dropdowns", async () => {
  const { buffer } = await buildTemplateWorkbook({
    customFieldLabels: ["Blood Type"],
  });
  const workbook = await workbookFrom(buffer);
  const custom = workbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME);
  assert.equal(custom?.getRow(1).getCell(2).text, "Blood Type");
  // No hidden sheet is created when there are no option lists.
  assert.equal(workbook.getWorksheet("_Lists"), undefined);
});

test("template: core dropdowns are preserved", async () => {
  const { buffer } = await buildTemplateWorkbook({ customFields: [] });
  const workbook = await workbookFrom(buffer);
  const employees = workbook.getWorksheet(EMPLOYEE_SHEET_NAME);
  assert.ok(employees);
  // Status (column 7) keeps its inline active/inactive list.
  assert.match(validationSource(employees!, "G"), /"active,inactive"/);
});

test("template: a newly created definition needs no source change", async () => {
  // Simulates the admin flow: create "Vehicle Plate" (select) then "Notes"
  // (textarea) in Settings → Employee Fields, download a fresh template.
  const first = await buildTemplateWorkbook({
    customFields: [
      { label: "Vehicle Plate", fieldType: "select", options: ["A", "B"] },
    ],
  });
  const firstWorkbook = await workbookFrom(first.buffer);
  assert.equal(
    firstWorkbook
      .getWorksheet(CUSTOM_FIELDS_SHEET_NAME)!
      .getRow(1)
      .getCell(2)
      .text,
    "Vehicle Plate"
  );
  const second = await buildTemplateWorkbook({
    customFields: [
      { label: "Vehicle Plate", fieldType: "select", options: ["A", "B"] },
      { label: "Notes", fieldType: "textarea", options: [] },
    ],
  });
  const secondWorkbook = await workbookFrom(second.buffer);
  const custom = secondWorkbook.getWorksheet(CUSTOM_FIELDS_SHEET_NAME)!;
  assert.equal(custom.getRow(1).getCell(3).text, "Notes");
  assert.match(validationSource(custom, "B"), /_Lists/);
  assert.equal(validationSource(custom, "C"), "");
});
