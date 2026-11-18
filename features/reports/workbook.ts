import ExcelJS from "exceljs";

export interface SheetSpec {
  name: string;
  columns: Array<{ header: string; key: string; width?: number }>;
  rows: Array<Record<string, string | number | null>>;
}

/**
 * Build a simple, consistently styled .xlsx (bold blue header row, frozen
 * header, auto filter). Used by every report export.
 */
export async function buildReportWorkbook(sheets: SheetSpec[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HRIS";
  workbook.created = new Date();
  for (const spec of sheets) {
    const sheet = workbook.addWorksheet(spec.name.slice(0, 31));
    sheet.columns = spec.columns.map((c) => ({
      header: c.header,
      key: c.key,
      width: c.width ?? Math.max(12, c.header.length + 4),
    }));
    for (const row of spec.rows) sheet.addRow(row);
    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B5CC5" } };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (spec.columns.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: spec.columns.length },
      };
    }
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}
