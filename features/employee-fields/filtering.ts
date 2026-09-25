/**
 * Dynamic custom-field search/filter support (Employee Master Data 2.0).
 *
 * PURE module: no database, no server-only, no Next.js imports, so the rules
 * are unit-testable with `node --test` like the rest of the validation layer.
 *
 * The field definitions are the single source of truth:
 *  - `parseCustomFieldFilters` accepts query parameters `cf:<fieldKey>` ONLY
 *    for keys present in the supplied ACTIVE definition specs. Unknown keys,
 *    archived/inactive fields (never passed in by the callers) and invalid
 *    values are silently ignored — the filter UI can only ever offer what the
 *    definitions allow.
 *  - Matching rules are chosen by `fieldType`, never by the field's name.
 */

import type { CustomFieldType } from "./validation.ts";

// Re-exported so callers import every custom-field rule from one place.
export {
  isFieldVisibleToRoles,
  isFieldEditableByRoles,
  isFieldWritableByRoles,
} from "./validation.ts";
export type { CustomFieldType } from "./validation.ts";

/** Query-parameter prefix identifying a custom-field filter. */
export const CUSTOM_FILTER_PARAM_PREFIX = "cf:";

/** Hard cap of simultaneous custom-field filters (abuse protection). */
export const MAX_CUSTOM_FIELD_FILTERS = 20;

/** One searchable/filterable active custom field. */
export interface CustomFieldFilterSpec {
  fieldDefinitionId: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options: readonly string[];
}

/** Normalized predicate for one custom-field filter. */
export type CustomFieldPredicate =
  /** text-ish columns: case-insensitive contains (value already escaped by callers). */
  | { kind: "contains"; value: string }
  /** number/currency: exact numeric equality. */
  | { kind: "numberEq"; value: number }
  /** checkbox: exact boolean equality. */
  | { kind: "booleanEq"; value: boolean }
  /** date: same UTC day. */
  | { kind: "dateEq"; value: string }
  /** datetime: same calendar day (date-only input). */
  | { kind: "datetimeDay"; value: string }
  /** datetime: same minute (datetime input). */
  | { kind: "datetimeEq"; value: string }
  /** select/radio/multiselect: stored option array contains the option. */
  | { kind: "optionAny"; value: string };

/** One validated filter (spec + predicate) ready for the SQL builder. */
export interface CustomFieldFilter {
  spec: CustomFieldFilterSpec;
  predicate: CustomFieldPredicate;
}

const TEXT_TYPES: readonly CustomFieldType[] = [
  "text",
  "textarea",
  "email",
  "phone",
  "url",
];

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function normalizeRaw(raw: unknown): string {
  if (Array.isArray(raw)) {
    const first = raw.find((entry) => typeof entry === "string" && entry.trim());
    return typeof first === "string" ? first.trim() : "";
  }
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Parse a value for one field definition into a predicate, or null when the
 * value is invalid/empty for that type. Type-driven only — never by name.
 */
export function parseCustomFieldPredicate(
  spec: CustomFieldFilterSpec,
  raw: unknown
): CustomFieldPredicate | null {
  const text = normalizeRaw(raw);
  if (!text) return null;

  if (TEXT_TYPES.includes(spec.fieldType)) {
    if (text.length > 200) return null;
    return { kind: "contains", value: text };
  }

  switch (spec.fieldType) {
    case "number":
    case "currency": {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) return null;
      return { kind: "numberEq", value: numeric };
    }
    case "date": {
      if (!DATE_PATTERN.test(text)) return null;
      const parsed = new Date(`${text}T00:00:00.000Z`);
      if (Number.isNaN(parsed.getTime())) return null;
      return { kind: "dateEq", value: text };
    }
    case "datetime": {
      // Accept `YYYY-MM-DD` (day match) or `YYYY-MM-DDTHH:mm`/ISO (minute match).
      if (DATE_PATTERN.test(text)) {
        return { kind: "datetimeDay", value: text };
      }
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) return null;
      return { kind: "datetimeEq", value: parsed.toISOString() };
    }
    case "checkbox": {
      const normalized = text.toLowerCase();
      if (["true", "1", "yes"].includes(normalized)) {
        return { kind: "booleanEq", value: true };
      }
      if (["false", "0", "no"].includes(normalized)) {
        return { kind: "booleanEq", value: false };
      }
      return null;
    }
    case "select":
    case "radio":
    case "multiselect": {
      if (!spec.options.includes(text)) return null;
      return { kind: "optionAny", value: text };
    }
    default:
      return null;
  }
}

/**
 * Extract `cf:<fieldKey>=value` pairs from raw (search) params and validate
 * each against the supplied ACTIVE definition specs. Entries whose key is not
 * an active spec, whose value fails the type rules, or that exceed the filter
 * cap are dropped. The result is the single input the SQL layer consumes.
 */
export function parseCustomFieldFilters(
  params: Record<string, string | string[] | undefined>,
  specs: readonly CustomFieldFilterSpec[]
): CustomFieldFilter[] {
  const byKey = new Map(specs.map((spec) => [spec.fieldKey, spec]));
  const filters: CustomFieldFilter[] = [];
  const seen = new Set<string>();

  for (const [name, raw] of Object.entries(params)) {
    if (!name.startsWith(CUSTOM_FILTER_PARAM_PREFIX)) continue;
    const fieldKey = name.slice(CUSTOM_FILTER_PARAM_PREFIX.length);
    const spec = byKey.get(fieldKey);
    if (!spec || seen.has(fieldKey)) continue;
    const predicate = parseCustomFieldPredicate(spec, raw);
    if (!predicate) continue;
    seen.add(fieldKey);
    filters.push({ spec, predicate });
    if (filters.length >= MAX_CUSTOM_FIELD_FILTERS) break;
  }

  return filters;
}

/** Serializable form of the parsed filters (safe to hand to server-only code). */
export function customFilterSpecKey(spec: CustomFieldFilterSpec): string {
  return `${spec.fieldDefinitionId}:${spec.fieldKey}`;
}

/** Narrow a definition-like row to a searchable spec. */
export function toCustomFieldFilterSpec<T extends {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: CustomFieldType;
  options: readonly string[];
}>(definition: T): CustomFieldFilterSpec {
  return {
    fieldDefinitionId: definition.id,
    fieldKey: definition.fieldKey,
    label: definition.label,
    fieldType: definition.fieldType,
    options: definition.options,
  };
}
