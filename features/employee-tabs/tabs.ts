/**
 * Employee Custom Tabs 2.0 — tab strip metadata + field placement (pure).
 *
 * PURE module: no database, no server-only, no Next.js imports, so every
 * merge/routing/placement rule is unit-testable with `node --test`.
 *
 * Two concepts:
 *  - SYSTEM TABS: the existing application routes/components on the employee
 *    profile (Overview, Personal, …). They stay hard-coded components; this
 *    module only carries their stable keys, labels and merge order.
 *  - CUSTOM TABS: metadata rows (`employee_custom_tabs`) rendered by the
 *    generic custom-field renderer. Nothing about them is per-tab code.
 *
 * The merged strip order comes from `displayOrder` metadata on both sides —
 * the numbers below are server-side metadata, never frontend logic.
 */

import { HEADER_SECTION, isTabVisibleToRoles } from "./validation.ts";
import { BUILTIN_FIELD_SECTIONS } from "../employee-fields/validation.ts";

/** One system tab on the employee profile (existing component/route). */
export interface SystemTabSpec {
  key: string;
  label: string;
  displayOrder: number;
  /**
   * Whether this tab renders. System tabs keep their own permission gate; the
   * value lives here as the neutral default so an unlisted key is never
   * rendered by accident.
   */
  visible?: boolean;
}

/**
 * System tabs with their merge order. Mirrors the current hard-coded strip;
 * a system tab keeps its component regardless of custom tab metadata.
 */
export const SYSTEM_TABS: readonly SystemTabSpec[] = [
  { key: "overview", label: "Overview", displayOrder: 10 },
  { key: "personal", label: "Personal", displayOrder: 20 },
  { key: "employment", label: "Employment", displayOrder: 30 },
  { key: "address", label: "Address", displayOrder: 40 },
  { key: "insurance", label: "Insurance", displayOrder: 50 },
  { key: "bank", label: "Bank Account", displayOrder: 60 },
  { key: "family", label: "Family", displayOrder: 90 },
  { key: "education", label: "Education", displayOrder: 100 },
  { key: "documents", label: "Documents", displayOrder: 110 },
  { key: "custom", label: "Custom Fields", displayOrder: 120 },
  { key: "attendance", label: "Attendance", displayOrder: 130 },
  { key: "leave", label: "Leave", displayOrder: 140 },
  { key: "payroll", label: "Payroll", displayOrder: 150 },
  { key: "history", label: "History", displayOrder: 160 },
];

/** URL ?tab= prefix for custom tabs (never collides with system keys). */
export const CUSTOM_TAB_PARAM_PREFIX = "custom:";

/** Build the ?tab= param key for a custom tab. */
export function customTabParamKey(tabKey: string): string {
  return `${CUSTOM_TAB_PARAM_PREFIX}${tabKey}`;
}

/** Extract the tab key from a ?tab= param, or null when not a custom tab. */
export function parseCustomTabParamKey(param: string): string | null {
  if (!param.startsWith(CUSTOM_TAB_PARAM_PREFIX)) return null;
  const key = param.slice(CUSTOM_TAB_PARAM_PREFIX.length);
  return key.length > 0 ? key : null;
}

/** Minimal custom tab shape shared by server queries and pure helpers. */
export interface CustomTabLike {
  id: string;
  tabKey: string;
  name: string;
  icon: string | null;
  displayOrder: number;
  status: string;
  /**
   * Role codes allowed to view the tab. Optional here so the pure helpers stay
   * usable from tests and callers that only care about ordering; when it is
   * absent the tab is treated as visible to every role (the same "empty means
   * everyone" rule the server query applies).
   */
  visibilityConfig?: readonly string[];
  /** Optional tab description, rendered under the tab heading. */
  description?: string | null;
}

/** One merged strip entry (system or custom). */
export interface MergedTabEntry {
  key: string;
  label: string;
  displayOrder: number;
  kind: "system" | "custom";
  /** The tab key for a custom entry; the system param key for a system one. */
  tabKey: string;
  /** False hides the tab from the strip without removing its slot. */
  visible: boolean;
}

/**
 * Merge the system tab metadata with an organization's custom tabs into one
 * ordered strip. Ties on displayOrder place the custom tab first (matches
 * the documented example: Kesehatan 90 before Family 90); within the same
 * kind, lower displayOrder wins and custom tabs fall back to name order.
 */
export function mergeTabStrip(
  customTabs: readonly CustomTabLike[],
  systemVisibility: Readonly<Record<string, boolean>> = {}
): MergedTabEntry[] {
  const entries: MergedTabEntry[] = [
    ...SYSTEM_TABS.map((tab) => ({
      key: tab.key,
      label: tab.label,
      displayOrder: tab.displayOrder,
      kind: "system" as const,
      tabKey: tab.key,
      visible: systemVisibility[tab.key] ?? tab.visible ?? true,
    })),
    ...customTabs.map((tab) => ({
      key: customTabParamKey(tab.tabKey),
      label: tab.icon ? `${tab.icon} ${tab.name}` : tab.name,
      displayOrder: tab.displayOrder,
      kind: "custom" as const,
      tabKey: tab.tabKey,
      visible: true,
    })),
  ];
  return entries.sort((a, b) => {
    if (a.displayOrder !== b.displayOrder) {
      return a.displayOrder - b.displayOrder;
    }
    if (a.kind !== b.kind) return a.kind === "custom" ? -1 : 1;
    return a.label.localeCompare(b.label);
  });
}

/**
 * Whether a `?tab=` value addresses a real, currently visible tab. Used to
 * validate a deep link: a custom tab the caller may not see, a retired tab or
 * a permission-gated system tab all fall back to the default tab instead of
 * rendering an unauthorized or empty view.
 */
export function isSelectableTab(
  strip: readonly MergedTabEntry[],
  param: string | undefined | null
): param is string {
  if (!param) return false;
  return strip.some((entry) => entry.key === param && entry.visible);
}

/** The first visible tab in the strip, used as the fallback deep-link target. */
export function defaultTabParam(
  strip: readonly MergedTabEntry[]
): string {
  return strip.find((entry) => entry.visible)?.key ?? "overview";
}

/**
 * Default displayOrder suggested for a NEW custom tab: 70 + 10 per existing
 * tab (the documented example sequence 70, 80, 90 …), capped at 9999.
 */
export function suggestedCustomTabDisplayOrder(
  existingCount: number
): number {
  return Math.min(70 + existingCount * 10, 9990);
}

/** Where a field definition renders, derived from its stored `section`. */
export type FieldPlacement =
  | { location: "header" }
  | { location: "system-section"; section: string }
  | { location: "custom-tab"; tab: CustomTabLike };

/**
 * Resolve a field definition's `section` into a display placement:
 *  - the header sentinel → header facts
 *  - an existing custom tab's key (active or inactive) → that tab
 *  - anything else (built-in sections, legacy free-form text) → system
 *    section, rendered grouped in the built-in Custom Fields tab.
 */
export function resolveFieldPlacement(
  section: string,
  customTabs: readonly CustomTabLike[]
): FieldPlacement {
  if (section === HEADER_SECTION) return { location: "header" };
  const tab = customTabs.find((candidate) => candidate.tabKey === section);
  if (tab) return { location: "custom-tab", tab };
  return { location: "system-section", section };
}

/** The tab (if any) a field is assigned to; null for header/system fields. */
export function fieldAssignedTab(
  section: string,
  customTabs: readonly CustomTabLike[]
): CustomTabLike | null {
  const placement = resolveFieldPlacement(section, customTabs);
  return placement.location === "custom-tab" ? placement.tab : null;
}

/** Whether `section` is a usable built-in section for the settings form. */
export function isBuiltinSection(section: string): boolean {
  return (BUILTIN_FIELD_SECTIONS as readonly string[]).includes(section);
}

/** Group title for fields that render in the built-in Custom Fields tab. */
export function customFieldsGroupTitle(
  section: string,
  customTabs: readonly CustomTabLike[]
): string {
  if (section === HEADER_SECTION) return "Header";
  const tab = customTabs.find((candidate) => candidate.tabKey === section);
  if (tab) return tab.icon ? `${tab.icon} ${tab.name}` : tab.name;
  return section;
}

/**
 * The custom tabs a given caller may actually SEE on an employee profile:
 * active ones only, and only when the role visibility config allows it.
 *
 * `roleCodes` must be the caller's role codes resolved on the server. An EMPTY
 * `visibilityConfig` means "every role that can already reach employee data",
 * so such a tab is kept — the tab is still gated by the caller's employee
 * view permission upstream.
 */
export function selectVisibleCustomTabs(
  customTabs: readonly CustomTabLike[],
  roleCodes: readonly string[]
): CustomTabLike[] {
  return customTabs.filter(
    (tab) =>
      tab.status === "active" &&
      isTabVisibleToRoles(tab.visibilityConfig ?? [], roleCodes)
  );
}

/** Minimal field shape needed to decide where a field renders. */
export interface ProfileFieldLike {
  id: string;
  section: string;
}

/**
 * Split the caller's visible fields into custom-tab buckets and a fallback
 * bucket for the built-in Custom Fields tab.
 *
 * `customTabs` must already be the CALLER-VISIBLE tab list (see
 * `selectVisibleCustomTabs`). A field assigned to a tab that is inactive, or
 * that the caller's roles may not see, deliberately falls through to the
 * fallback bucket instead of disappearing: the field's own visibility config
 * was already applied by the caller, so it is still legitimately viewable and
 * is rendered in the built-in tab. Nothing is dropped and nothing is
 * duplicated — every field lands in exactly one bucket.
 */
export function partitionFieldsForProfile<T extends ProfileFieldLike>(
  fields: readonly T[],
  customTabs: readonly CustomTabLike[]
): { byTab: Map<string, T[]>; fallback: T[] } {
  const byTab = new Map<string, T[]>();
  const fallback: T[] = [];
  for (const field of fields) {
    const placement = resolveFieldPlacement(field.section, customTabs);
    if (placement.location === "custom-tab") {
      const bucket = byTab.get(placement.tab.tabKey) ?? [];
      bucket.push(field);
      byTab.set(placement.tab.tabKey, bucket);
    } else {
      fallback.push(field);
    }
  }
  return { byTab, fallback };
}
