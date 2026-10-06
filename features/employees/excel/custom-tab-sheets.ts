/**
 * Custom Tab → Excel worksheet plan (Employee Custom Tabs 2.0, pure).
 *
 * PURE module: no database, no `server-only`, no Next.js imports, so the whole
 * workbook layout is unit-testable with `node --test`.
 *
 * DESIGN DECISION — one worksheet per Custom Tab, plus the pre-existing
 * `Custom Fields` worksheet for everything not assigned to a tab:
 *
 *  - Round-trip is the deciding requirement. A field's identity in the
 *    workbook is the `Label [fieldKey]` header, and the import analyzer
 *    resolves a column by that token. Tab placement is a VIEW of the
 *    definition's `section`; the planner never reads it back out of a
 *    workbook, so moving a field to another tab cannot corrupt an older file.
 *  - A worksheet per tab is what an HR user expects from "the Excel structure
 *    follows the tabs", and it keeps each tab's dropdowns independent.
 *  - The core employee worksheets are never renamed, reordered or replaced, and
 *    `Custom Fields` keeps its exact historical name and meaning, so every
 *    previously generated workbook still imports.
 */

import {
  CUSTOM_FIELDS_SHEET_NAME,
  EXPORT_SHEETS,
  resolveCustomTabSheetNames,
  type CustomFieldWorkbookColumn,
} from "./columns.ts";

/** A custom tab, reduced to what the workbook plan needs. */
export interface ExcelCustomTabLike {
  tabKey: string;
  name: string;
  icon: string | null;
  /** Only ACTIVE tabs may reach the workbook. */
  status: string;
}

/** One worksheet in the planned layout. */
export interface CustomTabSheetPlan {
  tabKey: string;
  sheetName: string;
  /** Fields assigned to this tab, in workbook column order. */
  fields: CustomFieldWorkbookColumn[];
  /** True for the built-in leftover sheet (no tab owns it). */
  isBuiltIn?: boolean;
}

export interface CustomTabWorkbookPlan {
  /** Per-tab sheets in tab display order, then the built-in leftover sheet. */
  sheets: CustomTabSheetPlan[];
  /** Fields on the built-in `Custom Fields` sheet (no active visible tab). */
  leftover: CustomFieldWorkbookColumn[];
  /** sheetName (lowercased) → tabKey, for the import side. */
  sheetNameToTabKey: Map<string, string>;
}

/**
 * Split the caller's visible custom fields into per-tab sheets.
 *
 * `customTabs` MUST already be the CALLER-VISIBLE, ACTIVE tab list (see
 * `selectVisibleCustomTabs`): a field parked on a tab this caller may not see
 * is deliberately not placed on a sheet for that tab. It lands in the built-in
 * `Custom Fields` sheet together with every unassigned field, so no value is
 * ever lost from the workbook.
 */
export function planCustomTabSheets(
  tabs: readonly ExcelCustomTabLike[],
  fields: readonly CustomFieldWorkbookColumn[]
): CustomTabWorkbookPlan {
  const sheetNames = resolveCustomTabSheetNames(
    tabs.map((tab) => ({ tabKey: tab.tabKey, name: tab.name })),
    EXPORT_SHEETS
  );
  const sheetNameByKey = new Map(
    sheetNames.map((entry) => [entry.tabKey, entry.sheetName])
  );
  const sheetNameToTabKey = new Map(
    sheetNames.map((entry) => [entry.sheetName.toLowerCase(), entry.tabKey])
  );

  const byTab = new Map<string, CustomFieldWorkbookColumn[]>();
  const leftover: CustomFieldWorkbookColumn[] = [];
  for (const field of fields) {
    // `tabKey` is resolved by the caller from the definition's `section`
    // against the caller's VISIBLE tab list. A field whose tab is not in this
    // plan (unassigned, or a tab this caller cannot see) is never dropped: it
    // stays on the built-in `Custom Fields` sheet.
    const tabKey = field.tabKey ?? null;
    if (tabKey && sheetNameByKey.has(tabKey)) {
      const bucket = byTab.get(tabKey) ?? [];
      bucket.push(field);
      byTab.set(tabKey, bucket);
    } else {
      leftover.push(field);
    }
  }

  const sheets: CustomTabSheetPlan[] = sheetNames.map((entry) => ({
    tabKey: entry.tabKey,
    sheetName: entry.sheetName,
    fields: byTab.get(entry.tabKey) ?? [],
  }));

  return { sheets, leftover, sheetNameToTabKey };
}

/**
 * Worksheet names a workbook may legitimately contain for custom data: the
 * built-in sheet plus every planned per-tab sheet. Used by the import side to
 * decide whether an unknown worksheet is a Custom Tab sheet or a typo.
 */
export function customDataSheetNames(
  plan: CustomTabWorkbookPlan
): string[] {
  return [CUSTOM_FIELDS_SHEET_NAME, ...plan.sheets.map((sheet) => sheet.sheetName)];
}
