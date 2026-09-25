/**
 * Custom employee field validation (Employee Master Data 2.0).
 *
 * Pure module: no `server-only`, no database, no Next.js imports. Both server
 * actions (`features/employee-fields/actions.ts`) and the Excel import parser
 * (`features/employees/excel/import.ts`) import this so the same rules apply
 * everywhere.
 *
 * Two responsibilities:
 *  1. Validate a field *definition* (key, type, section, options, limits).
 *  2. Parse/coerce a raw *value* for a given definition into the typed columns
 *     of `employee_custom_field_values` (value_text / value_number /
 *     value_date / value_boolean / value_json).
 */

export const CUSTOM_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "currency",
  "email",
  "phone",
  "date",
  "datetime",
  "checkbox",
  "select",
  "multiselect",
  "radio",
  "url",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Built-in section names shown as grouped tabs in the profile. */
export const BUILTIN_FIELD_SECTIONS = [
  "Personal",
  "Contact",
  "Employment",
  "Address",
  "Insurance",
  "Family",
  "Education",
  "Other",
] as const;

export type BuiltinFieldSection = (typeof BUILTIN_FIELD_SECTIONS)[number];

/** A field's `status` lifecycle value (mirrors the DB column). */
export const CUSTOM_FIELD_STATUSES = ["active", "inactive", "archived"] as const;

export type CustomFieldStatus = (typeof CUSTOM_FIELD_STATUSES)[number];

/**
 * Whether a field definition is visible to the caller's roles.
 *
 * `visibilityConfig` holds the role codes allowed to view the field; an EMPTY
 * config means every role that can already reach employee data may see it.
 * The server layer (pages, exports, filters) is the only decision point — the
 * client never re-implements it from stored roles.
 */
export function isFieldVisibleToRoles(
  visibilityConfig: readonly string[],
  roleCodes: readonly string[]
): boolean {
  if (visibilityConfig.length === 0) return true;
  return visibilityConfig.some((code) => roleCodes.includes(code));
}

/** Whether a field definition is editable by the caller's roles. */
export function isFieldEditableByRoles(
  editableByConfig: readonly string[],
  roleCodes: readonly string[]
): boolean {
  if (editableByConfig.length === 0) return true;
  return editableByConfig.some((code) => roleCodes.includes(code));
}

export function isFieldWritableByRoles(
  visibilityConfig: readonly string[],
  editableByConfig: readonly string[],
  roleCodes: readonly string[]
): boolean {
  return (
    isFieldVisibleToRoles(visibilityConfig, roleCodes) &&
    isFieldEditableByRoles(editableByConfig, roleCodes)
  );
}

/**
 * Field keys must be a short, stable, machine-safe identifier:
 * lowercase letter first, then lowercase letters / digits / underscores,
 * 2..32 characters total. (e.g. `blood_type`, `shirt_size`.)
 */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export const LIMITS = {
  label: 120,
  description: 500,
  section: 40,
  optionLabel: 100,
  maxOptions: 100,
  maxSelectedOptions: 50,
  text: 4000,
  textarea: 8000,
  email: 320,
  phone: 40,
  url: 2048,
} as const;

export interface CustomFieldDefinitionInput {
  fieldKey: string;
  label: string;
  description?: string | null;
  fieldType: CustomFieldType;
  section?: string | null;
  isRequired?: boolean;
  displayOrder?: number;
  options?: string[];
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

function push(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

/**
 * Validate a field definition before insert/update. Returns every problem at
 * once so an administrator fixing a form sees them all in one pass.
 */
export function validateCustomFieldDefinition(
  input: CustomFieldDefinitionInput
): ValidationResult {
  const errors: string[] = [];

  push(
    errors,
    typeof input.fieldKey === "string" &&
      FIELD_KEY_PATTERN.test(input.fieldKey),
    `Field key must be 2-32 characters, start with a lowercase letter and contain only lowercase letters, digits or underscores.`
  );

  push(
    errors,
    typeof input.label === "string" &&
      input.label.trim().length > 0 &&
      input.label.trim().length <= LIMITS.label,
    `Label must be 1-${LIMITS.label} characters.`
  );

  if (input.description != null) {
    push(
      errors,
      input.description.length <= LIMITS.description,
      `Description must be at most ${LIMITS.description} characters.`
    );
  }

  push(
    errors,
    CUSTOM_FIELD_TYPES.includes(input.fieldType),
    `Field type must be one of: ${CUSTOM_FIELD_TYPES.join(", ")}.`
  );

  if (input.section != null) {
    push(
      errors,
      input.section.trim().length > 0 &&
        input.section.trim().length <= LIMITS.section,
      `Section must be 1-${LIMITS.section} characters.`
    );
  }

  if (input.displayOrder != null) {
    push(
      errors,
      Number.isInteger(input.displayOrder) && input.displayOrder >= 0,
      "Display order must be a non-negative integer."
    );
  }

  const needsOptions =
    input.fieldType === "select" ||
    input.fieldType === "multiselect" ||
    input.fieldType === "radio";

  if (needsOptions) {
    const options = (input.options ?? []).map((option) => option.trim());
    push(
      errors,
      options.length > 0,
      `Options are required for ${input.fieldType} fields.`
    );
    push(
      errors,
      options.length <= LIMITS.maxOptions,
      `A field can have at most ${LIMITS.maxOptions} options.`
    );
    push(
      errors,
      options.every(
        (option) =>
          option.length > 0 && option.length <= LIMITS.optionLabel
      ),
      `Each option must be 1-${LIMITS.optionLabel} characters.`
    );
    push(
      errors,
      new Set(options).size === options.length,
      "Options must be unique."
    );
  }

  return { ok: errors.length === 0, errors };
}

/** The typed columns written to `employee_custom_field_values`. */
export interface NormalizedCustomFieldValue {
  valueText: string | null;
  valueNumber: string | null;
  valueDate: Date | null;
  valueBoolean: boolean | null;
  valueJson: string[] | null;
}

export type ParseValueResult =
  | { ok: true; value: NormalizedCustomFieldValue }
  | { ok: false; error: string };

function emptyValue(): NormalizedCustomFieldValue {
  return {
    valueText: null,
    valueNumber: null,
    valueDate: null,
    valueBoolean: null,
    valueJson: null,
  };
}

function asTrimmedString(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw.trim();
  if (typeof raw === "number" || typeof raw === "boolean") return String(raw);
  return "";
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.toISOString().slice(0, 10) === value;
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fail(error: string): ParseValueResult {
  return { ok: false, error };
}

function success(
  mutate: (value: NormalizedCustomFieldValue) => void
): ParseValueResult {
  const value = emptyValue();
  mutate(value);
  return { ok: true, value };
}

/**
 * Parse a raw value (from a form, a JSON payload or an Excel cell) against a
 * field definition. Returns the typed columns to persist, or a human-readable
 * error message suitable for an import error report.
 */
export function parseCustomFieldValue(
  fieldType: CustomFieldType,
  raw: unknown,
  options: readonly string[] = []
): ParseValueResult {
  // Empty / null always clears the value regardless of type.
  const text = asTrimmedString(raw);
  if (
    text === "" ||
    raw === null ||
    raw === undefined ||
    (Array.isArray(raw) && raw.length === 0)
  ) {
    return success(() => {});
  }

  switch (fieldType) {
    case "text":
    case "textarea": {
      const max = fieldType === "textarea" ? LIMITS.textarea : LIMITS.text;
      if (text.length > max) {
        return fail(`Value must be at most ${max} characters.`);
      }
      return success((value) => {
        value.valueText = text;
      });
    }

    case "email": {
      if (text.length > LIMITS.email || !EMAIL_PATTERN.test(text)) {
        return fail("Value must be a valid email address.");
      }
      return success((value) => {
        value.valueText = text;
      });
    }

    case "phone": {
      if (text.length > LIMITS.phone || !/^\+?[0-9()\-\s]{5,}$/.test(text)) {
        return fail("Value must be a valid phone number.");
      }
      return success((value) => {
        value.valueText = text;
      });
    }

    case "url": {
      if (text.length > LIMITS.url || !isValidUrl(text)) {
        return fail("Value must be a valid http(s) URL.");
      }
      return success((value) => {
        value.valueText = text;
      });
    }

    case "number":
    case "currency": {
      const numeric = Number(text);
      if (!Number.isFinite(numeric)) {
        return fail("Value must be a number.");
      }
      if (fieldType === "currency") {
        const rounded = Math.round(numeric * 100) / 100;
        if (Math.abs(rounded) > Number.MAX_SAFE_INTEGER / 100) {
          return fail("Value is too large.");
        }
        return success((value) => {
          value.valueNumber = rounded.toFixed(2);
        });
      }
      return success((value) => {
        value.valueNumber = String(numeric);
      });
    }

    case "date": {
      if (!isValidIsoDate(text)) {
        return fail("Value must be a valid date in YYYY-MM-DD format.");
      }
      return success((value) => {
        value.valueDate = new Date(`${text}T00:00:00.000Z`);
      });
    }

    case "datetime": {
      const parsed = new Date(text);
      if (Number.isNaN(parsed.getTime())) {
        return fail("Value must be a valid date-time.");
      }
      return success((value) => {
        value.valueDate = parsed;
      });
    }

    case "checkbox": {
      const normalized = text.toLowerCase();
      if (!["true", "false", "1", "0", "yes", "no"].includes(normalized)) {
        return fail("Value must be a boolean (true/false).");
      }
      return success((value) => {
        value.valueBoolean = ["true", "1", "yes"].includes(normalized);
      });
    }

    case "select":
    case "radio": {
      if (!options.includes(text)) {
        return fail(
          `Value must be one of: ${options.slice(0, 10).join(", ")}.`
        );
      }
      return success((value) => {
        value.valueJson = [text];
      });
    }

    case "multiselect": {
      const selected = text
        .split(",")
        .map((part) => part.trim())
        .filter((part) => part.length > 0);
      if (selected.length > LIMITS.maxSelectedOptions) {
        return fail(
          `At most ${LIMITS.maxSelectedOptions} options may be selected.`
        );
      }
      for (const option of selected) {
        if (!options.includes(option)) {
          return fail(`Unknown option "${option}".`);
        }
      }
      return success((value) => {
        value.valueJson = selected;
      });
    }
  }
}

/**
 * Human-readable display for a stored value row (used by the Excel export and
 * the profile view). Mirrors the inverse of `parseCustomFieldValue`.
 */
export function formatStoredValue(
  fieldType: CustomFieldType,
  row: Partial<NormalizedCustomFieldValue>
): string {
  if (fieldType === "multiselect" || fieldType === "select" || fieldType === "radio") {
    return (row.valueJson ?? []).join(", ");
  }
  if (fieldType === "checkbox") {
    return row.valueBoolean ? "Yes" : "No";
  }
  if (fieldType === "date" || fieldType === "datetime") {
    if (!row.valueDate) return "";
    return row.valueDate instanceof Date
      ? row.valueDate.toISOString()
      : String(row.valueDate);
  }
  if (fieldType === "number" || fieldType === "currency") {
    return row.valueNumber ?? "";
  }
  return row.valueText ?? "";
}