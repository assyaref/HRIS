/**
 * Employee Custom Tab validation (Employee Custom Tabs 2.0).
 *
 * PURE module: no `server-only`, no database, no Next.js imports — mirrors
 * `features/employee-fields/validation.ts` so the same rules are unit-test
 * with `node --test` and shared by server actions and the settings UI.
 *
 * A tab is a grouping container for existing dynamic custom fields. Field
 * definitions are assigned to a tab through their existing `section` column:
 * the tab key is stored verbatim, so no field-schema change is involved.
 */

/** A tab's `status` lifecycle value (mirrors the DB column). */
export const CUSTOM_TAB_STATUSES = ["active", "inactive"] as const;

export type CustomTabStatus = (typeof CUSTOM_TAB_STATUSES)[number];

/**
 * Sentinel `section` value marking a field as a HEADER display field
 * (rendered as a quick-glance fact in the profile header). Chosen so it can
 * never collide with a real tab key or a built-in section name.
 */
export const HEADER_SECTION = "__header__" as const;

/**
 * Display locations offered for a custom field. Stored on the field
 * definition via its existing `section` column:
 *  - `header`     → section = HEADER_SECTION sentinel
 *  - `system-tab` → section = a built-in section name (Personal, …)
 *  - `custom-tab` → section = the target custom tab's key
 */
export const CUSTOM_FIELD_LOCATIONS = [
  "system-tab",
  "custom-tab",
  "header",
] as const;

export type CustomFieldLocation = (typeof CUSTOM_FIELD_LOCATIONS)[number];

/**
 * Tab keys must be short, stable, machine-safe identifiers — the same shape
 * as custom field keys: lowercase letter first, then lowercase letters /
 * digits / underscores, 2..32 characters total (e.g. `certification`).
 */
export const TAB_KEY_PATTERN = /^[a-z][a-z0-9_]{1,31}$/;

export const TAB_LIMITS = {
  name: 80,
  description: 500,
  icon: 24,
  displayOrder: 9999,
} as const;

/**
 * Keys that can never become custom tab keys: the employee profile system
 * tab param keys, the built-in field-section slugs, the header sentinel and
 * the Excel sheet namespace. Prevents a tab key from shadowing an existing
 * routing/section concept.
 */
export const RESERVED_TAB_KEYS: readonly string[] = [
  // Employee detail system tabs (URL ?tab= keys).
  "overview",
  "personal",
  "employment",
  "address",
  "insurance",
  "bank",
  "family",
  "education",
  "documents",
  "custom",
  "attendance",
  "leave",
  "payroll",
  "history",
  // Built-in field sections (lowercased).
  "contact",
  "other",
  // Header sentinel + reserved words.
  "header",
  "system",
  "tabs",
];

/**
 * Normalize a free-form label into a tab key candidate: lowercase, collapse
 * non-alphanumerics to underscores, trim underscores, cap at 32 characters.
 * Returns "" when nothing usable remains.
 */
export function normalizeTabKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32)
    .replace(/_+$/g, "");
}

export interface CustomTabDefinitionInput {
  tabKey: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  displayOrder?: number;
  status?: string;
}

export interface TabValidationResult {
  ok: boolean;
  errors: string[];
}

function push(errors: string[], condition: boolean, message: string): void {
  if (!condition) errors.push(message);
}

/**
 * Validate a custom tab definition before insert/update. Returns every
 * problem at once, mirroring `validateCustomFieldDefinition`.
 */
export function validateCustomTabDefinition(
  input: CustomTabDefinitionInput
): TabValidationResult {
  const errors: string[] = [];

  push(
    errors,
    typeof input.tabKey === "string" && TAB_KEY_PATTERN.test(input.tabKey),
    "Tab key must be 2-32 characters, start with a lowercase letter and contain only lowercase letters, digits or underscores."
  );
  push(
    errors,
    typeof input.tabKey !== "string" || !RESERVED_TAB_KEYS.includes(input.tabKey),
    `Tab key "${input.tabKey}" is reserved.`
  );

  push(
    errors,
    typeof input.name === "string" &&
      input.name.trim().length > 0 &&
      input.name.trim().length <= TAB_LIMITS.name,
    `Tab name must be 1-${TAB_LIMITS.name} characters.`
  );

  if (input.description != null) {
    push(
      errors,
      input.description.length <= TAB_LIMITS.description,
      `Description must be at most ${TAB_LIMITS.description} characters.`
    );
  }

  if (input.icon != null && input.icon.trim() !== "") {
    push(
      errors,
      input.icon.trim().length <= TAB_LIMITS.icon,
      `Icon must be at most ${TAB_LIMITS.icon} characters.`
    );
  }

  if (input.displayOrder != null) {
    push(
      errors,
      Number.isInteger(input.displayOrder) &&
        input.displayOrder >= 0 &&
        input.displayOrder <= TAB_LIMITS.displayOrder,
      "Display order must be an integer between 0 and 9999."
    );
  }

  if (input.status != null) {
    push(
      errors,
      (CUSTOM_TAB_STATUSES as readonly string[]).includes(input.status),
      "Status must be active or inactive."
    );
  }

  return { ok: errors.length === 0, errors };
}

/**
 * Whether a custom tab is visible to the caller's roles. Mirrors the custom
 * field contract: an EMPTY visibility config means every role that may
 * already view employee data sees the tab.
 */
export function isTabVisibleToRoles(
  visibilityConfig: readonly string[],
  roleCodes: readonly string[]
): boolean {
  if (visibilityConfig.length === 0) return true;
  return visibilityConfig.some((code) => roleCodes.includes(code));
}

/**
 * Strip the header sentinel danger from a stored `section` value: sections
 * are user-facing, the sentinel is not. Used when a definition row has to
 * be displayed without its display-location context.
 */
export function displaySectionName(section: string): string {
  if (section === HEADER_SECTION) return "Header";
  return section;
}
