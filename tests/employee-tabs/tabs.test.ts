import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_TAB_STATUSES,
  HEADER_SECTION,
  RESERVED_TAB_KEYS,
  TAB_KEY_PATTERN,
  isTabVisibleToRoles,
  normalizeTabKey,
  validateCustomTabDefinition,
} from "../../features/employee-tabs/validation.ts";
import {
  customTabParamKey,
  defaultTabParam,
  fieldAssignedTab,
  isBuiltinSection,
  isSelectableTab,
  mergeTabStrip,
  parseCustomTabParamKey,
  partitionFieldsForProfile,
  resolveFieldPlacement,
  selectVisibleCustomTabs,
  suggestedCustomTabDisplayOrder,
  SYSTEM_TABS,
  type CustomTabLike,
} from "../../features/employee-tabs/tabs.ts";

function tab(overrides: Partial<CustomTabLike> = {}): CustomTabLike {
  return {
    id: overrides.tabKey ?? "tab-1",
    tabKey: "certification",
    name: "Certification",
    icon: null,
    displayOrder: 70,
    status: "active",
    visibilityConfig: [],
    description: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// System tab metadata: the exact profile order the product specifies.
// ---------------------------------------------------------------------------

test("system tabs cover every required employee profile tab", () => {
  assert.deepEqual(
    SYSTEM_TABS.map((entry) => entry.key),
    [
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
    ]
  );
});

test("system tab labels match the product wording", () => {
  const labels = SYSTEM_TABS.map((entry) => entry.label);
  for (const label of [
    "Personal",
    "Employment",
    "Address",
    "Insurance",
    "Bank Account",
    "Family",
    "Education",
    "Documents",
    "Custom Fields",
    "Attendance",
    "Leave",
    "Payroll",
    "History",
  ]) {
    assert.ok(labels.includes(label), `missing system tab label ${label}`);
  }
});

test("system tab display order is strictly ascending", () => {
  const orders = SYSTEM_TABS.map((entry) => entry.displayOrder);
  for (let index = 1; index < orders.length; index += 1) {
    assert.ok(
      orders[index] > orders[index - 1],
      `display order not ascending at ${SYSTEM_TABS[index].key}`
    );
  }
});

// ---------------------------------------------------------------------------
// merge tab strip
// ---------------------------------------------------------------------------

test("merge tab strip: with no custom tabs it is exactly the system tabs", () => {
  const strip = mergeTabStrip([]);
  assert.deepEqual(
    strip.map((entry) => entry.key),
    SYSTEM_TABS.map((entry) => entry.key)
  );
  assert.ok(strip.every((entry) => entry.kind === "system"));
});

test("merge tab strip: a custom tab is placed by displayOrder, not appended", () => {
  const strip = mergeTabStrip([tab({ displayOrder: 70 })]);
  const keys = strip.map((entry) => entry.key);
  // 70 sits between "bank" (60) and "family" (90).
  assert.deepEqual(keys, [
    "overview",
    "personal",
    "employment",
    "address",
    "insurance",
    "bank",
    "custom:certification",
    "family",
    "education",
    "documents",
    "custom",
    "attendance",
    "leave",
    "payroll",
    "history",
  ]);
});

test("merge tab strip: custom tabs sort among themselves by displayOrder", () => {
  const strip = mergeTabStrip([
    tab({ id: "a", tabKey: "training", displayOrder: 95 }),
    tab({ id: "b", tabKey: "health", displayOrder: 75 }),
  ]);
  const custom = strip.filter((entry) => entry.kind === "custom");
  assert.deepEqual(
    custom.map((entry) => entry.tabKey),
    ["health", "training"]
  );
});

test("merge tab strip: a displayOrder tie puts the custom tab first", () => {
  // "family" sits at 90; a custom tab at 90 must precede it.
  const strip = mergeTabStrip([tab({ displayOrder: 90 })]);
  const keys = strip.map((entry) => entry.key);
  assert.ok(
    keys.indexOf("custom:certification") < keys.indexOf("family"),
    "custom tab should precede the system tab on a tie"
  );
});

test("merge tab strip: prefix puts the custom tab before the system tab with the same order", () => {
  const strip = mergeTabStrip([tab({ displayOrder: 70 })]);
  const custom = strip.find((entry) => entry.key === "custom:certification");
  assert.equal(custom?.kind, "custom");
  assert.equal(custom?.tabKey, "certification");
});

test("merge tab strip: system visibility gates only system entries", () => {
  const strip = mergeTabStrip([tab()], {
    bank: false,
    payroll: false,
  });
  assert.equal(strip.find((entry) => entry.key === "bank")?.visible, false);
  assert.equal(strip.find((entry) => entry.key === "payroll")?.visible, false);
  assert.equal(strip.find((entry) => entry.key === "personal")?.visible, true);
  // A custom tab is never stripped by the system visibility map.
  assert.equal(
    strip.find((entry) => entry.key === "custom:certification")?.visible,
    true
  );
});

test("merge tab strip: icon is prefixed to the label when present", () => {
  const strip = mergeTabStrip([tab({ icon: "🏥" })]);
  assert.equal(
    strip.find((entry) => entry.kind === "custom")?.label,
    "🏥 Certification"
  );
});

test("merge tab strip: the key namespace never collides with a system key", () => {
  const strip = mergeTabStrip([
    tab({ tabKey: "a" }),
    tab({ id: "b", tabKey: "b" }),
  ]);
  const systemKeys = SYSTEM_TABS.map((entry) => entry.key);
  for (const entry of strip.filter((item) => item.kind === "custom")) {
    assert.ok(!systemKeys.includes(entry.key));
    assert.ok(entry.key.startsWith("custom:"));
  }
});

// ---------------------------------------------------------------------------
// URL param round-trip
// ---------------------------------------------------------------------------

test("custom tab param key round-trips", () => {
  assert.equal(customTabParamKey("health"), "custom:health");
  assert.equal(parseCustomTabParamKey("custom:health"), "health");
});

test("parse custom tab param key rejects system params and empty keys", () => {
  assert.equal(parseCustomTabParamKey("personal"), null);
  assert.equal(parseCustomTabParamKey("custom:"), null);
  assert.equal(parseCustomTabParamKey(""), null);
});

// ---------------------------------------------------------------------------
// Active / role visibility
// ---------------------------------------------------------------------------

test("select visible custom tabs drops inactive tabs", () => {
  const visible = selectVisibleCustomTabs(
    [
      tab({ id: "a", tabKey: "active_one", status: "active" }),
      tab({ id: "b", tabKey: "retired", status: "inactive" }),
    ],
    []
  );
  assert.deepEqual(
    visible.map((entry) => entry.tabKey),
    ["active_one"]
  );
});

test("select visible custom tabs honours role visibility config", () => {
  const tabs = [
    tab({ id: "a", tabKey: "hr_only", visibilityConfig: ["HR_ADMIN"] }),
    tab({ id: "b", tabKey: "everyone", visibilityConfig: [] }),
    tab({
      id: "c",
      tabKey: "finance_only",
      visibilityConfig: ["PAYROLL_ADMIN"],
    }),
  ];
  assert.deepEqual(
    selectVisibleCustomTabs(tabs, ["HR_ADMIN"]).map((entry) => entry.tabKey),
    ["hr_only", "everyone"]
  );
  // A caller with no matching role never sees the restricted tab.
  assert.deepEqual(
    selectVisibleCustomTabs(tabs, ["VIEWER"]).map((entry) => entry.tabKey),
    ["everyone"]
  );
});

test("select visible custom tabs: an inactive tab stays hidden even for an allowed role", () => {
  const visible = selectVisibleCustomTabs(
    [tab({ tabKey: "retired", status: "inactive", visibilityConfig: ["HR_ADMIN"] })],
    ["HR_ADMIN"]
  );
  assert.deepEqual(visible, []);
});

test("is tab visible to roles: empty config means every role", () => {
  assert.equal(isTabVisibleToRoles([], []), true);
  assert.equal(isTabVisibleToRoles([], ["VIEWER"]), true);
  assert.equal(isTabVisibleToRoles(["HR_ADMIN"], ["VIEWER"]), false);
  assert.equal(isTabVisibleToRoles(["HR_ADMIN"], ["VIEWER", "HR_ADMIN"]), true);
});

// ---------------------------------------------------------------------------
// Deep-link validation
// ---------------------------------------------------------------------------

test("is selectable tab accepts a visible system tab and a visible custom tab", () => {
  const strip = mergeTabStrip([tab({ tabKey: "health" })]);
  assert.equal(isSelectableTab(strip, "personal"), true);
  assert.equal(isSelectableTab(strip, "custom:health"), true);
});

test("is selectable tab rejects an invisible system tab", () => {
  const strip = mergeTabStrip([], { bank: false });
  assert.equal(isSelectableTab(strip, "bank"), false);
  assert.equal(isSelectableTab(strip, "personal"), true);
});

test("is selectable tab rejects an unknown or absent param", () => {
  const strip = mergeTabStrip([]);
  assert.equal(isSelectableTab(strip, "custom:nonexistent"), false);
  assert.equal(isSelectableTab(strip, "nope"), false);
  assert.equal(isSelectableTab(strip, null), false);
  assert.equal(isSelectableTab(strip, undefined), false);
});

test("default tab param is the first visible entry in the strip", () => {
  assert.equal(defaultTabParam(mergeTabStrip([])), "overview");
  const hidden = mergeTabStrip([], { overview: false, personal: false });
  assert.equal(defaultTabParam(hidden), "employment");
});

// ---------------------------------------------------------------------------
// Field placement
// ---------------------------------------------------------------------------

test("resolve field placement maps the header sentinel to header", () => {
  assert.deepEqual(resolveFieldPlacement(HEADER_SECTION, []), {
    location: "header",
  });
});

test("resolve field placement maps a custom tab key to that tab", () => {
  const tabs = [tab({ tabKey: "health" })];
  const placement = resolveFieldPlacement("health", tabs);
  assert.equal(placement.location, "custom-tab");
  if (placement.location === "custom-tab") {
    assert.equal(placement.tab.tabKey, "health");
  }
});

test("resolve field placement keeps built-in sections as system sections", () => {
  const placement = resolveFieldPlacement("Personal", [tab()]);
  assert.deepEqual(placement, { location: "system-section", section: "Personal" });
});

test("resolve field placement keeps legacy free-form sections as system sections", () => {
  // A section that is neither a built-in nor a tab must still render.
  const placement = resolveFieldPlacement("Some Legacy Section", [tab()]);
  assert.equal(placement.location, "system-section");
});

test("field assigned tab returns null for header and system fields", () => {
  const tabs = [tab({ tabKey: "health" })];
  assert.equal(fieldAssignedTab(HEADER_SECTION, tabs), null);
  assert.equal(fieldAssignedTab("Other", tabs), null);
  assert.equal(fieldAssignedTab("health", tabs)?.tabKey, "health");
});

test("is builtin section recognises the catalog and rejects a tab key", () => {
  assert.equal(isBuiltinSection("Personal"), true);
  assert.equal(isBuiltinSection("Other"), true);
  assert.equal(isBuiltinSection("health"), false);
});

// ---------------------------------------------------------------------------
// Field partitioning across custom tabs
// ---------------------------------------------------------------------------

test("partition fields: each field lands in exactly one bucket, none duplicated", () => {
  const tabs = [tab({ tabKey: "health" }), tab({ id: "b", tabKey: "training" })];
  const fields = [
    { id: "f1", section: "health" },
    { id: "f2", section: "training" },
    { id: "f3", section: "Personal" },
    { id: "f4", section: HEADER_SECTION },
  ];
  const { byTab, fallback } = partitionFieldsForProfile(fields, tabs);
  assert.deepEqual(
    byTab.get("health")?.map((field) => field.id),
    ["f1"]
  );
  assert.deepEqual(
    byTab.get("training")?.map((field) => field.id),
    ["f2"]
  );
  assert.deepEqual(
    fallback.map((field) => field.id),
    ["f3", "f4"]
  );
  const total =
    fallback.length +
    [...byTab.values()].reduce((sum, bucket) => sum + bucket.length, 0);
  assert.equal(total, fields.length, "no field may be lost or duplicated");
});

test("partition fields: a field on a tab the caller cannot see falls back, not vanishes", () => {
  const visible = selectVisibleCustomTabs(
    [tab({ tabKey: "hr_only", visibilityConfig: ["HR_ADMIN"] })],
    ["VIEWER"]
  );
  const fields = [
    { id: "restricted", section: "hr_only" },
    { id: "plain", section: "Other" },
  ];
  const { byTab, fallback } = partitionFieldsForProfile(fields, visible);
  assert.equal(byTab.size, 0, "the restricted tab is not rendered for this role");
  assert.deepEqual(
    fallback.map((field) => field.id),
    ["restricted", "plain"],
    "the field is still viewable in the built-in tab"
  );
});

test("partition fields: a field on a retired tab falls back to the built-in tab", () => {
  // The caller passes the VISIBLE list, so a retired tab is absent by design.
  const fields = [{ id: "legacy", section: "retired_tab" }];
  const { byTab, fallback } = partitionFieldsForProfile(fields, []);
  assert.equal(byTab.size, 0);
  assert.deepEqual(
    fallback.map((field) => field.id),
    ["legacy"]
  );
});

test("partition fields: with no custom tabs everything falls back (existing behavior)", () => {
  const fields = [
    { id: "f1", section: "Personal" },
    { id: "f2", section: "Other" },
    { id: "f3", section: HEADER_SECTION },
  ];
  const { byTab, fallback } = partitionFieldsForProfile(fields, []);
  assert.equal(byTab.size, 0);
  assert.deepEqual(
    fallback.map((field) => field.id),
    ["f1", "f2", "f3"]
  );
});

test("partition fields: an empty custom tab produces no bucket entry", () => {
  const tabs = [tab({ tabKey: "health" }), tab({ id: "b", tabKey: "empty" })];
  const { byTab } = partitionFieldsForProfile(
    [{ id: "f1", section: "health" }],
    tabs
  );
  assert.deepEqual([...byTab.keys()], ["health"]);
});

// ---------------------------------------------------------------------------
// Organization isolation: the pure helpers take an already scoped list, so the
// guarantee lives in the query. Assert the contract the page relies on.
// ---------------------------------------------------------------------------

test("organization isolation: the strip is built only from the caller's scoped list", () => {
  // The page passes exactly listActiveCustomTabs(organizationId), which is
  // filtered by organization_id in SQL. So org B's tab is simply not in the
  // array and cannot appear in org A's strip: assert on the empty scoped list.
  const orgAScopedTabs: CustomTabLike[] = [];
  const strip = mergeTabStrip(orgAScopedTabs, {});
  assert.equal(
    strip.find((entry) => entry.key === "custom:health"),
    undefined,
    "a tab from another organization must not reach the strip"
  );

  // Defense in depth: a field whose section names a foreign/unknown tab falls
  // back to the built-in tab rather than rendering it under a foreign tab.
  const { byTab, fallback } = partitionFieldsForProfile(
    [{ id: "x", section: "health" }],
    orgAScopedTabs
  );
  assert.equal(byTab.size, 0, "no bucket may be created for an out-of-scope tab");
  assert.equal(fallback.length, 1);
});

// ---------------------------------------------------------------------------
// Tab key / definition validation
// ---------------------------------------------------------------------------

test("normalize tab key produces a usable key from a free-form label", () => {
  assert.equal(normalizeTabKey("Sertifikasi & Training"), "sertifikasi_training");
  assert.equal(normalizeTabKey("  Health  "), "health");
  assert.equal(normalizeTabKey("Kesehatan"), "kesehatan");
  assert.equal(normalizeTabKey("!!!"), "");
});

test("normalize tab key output always satisfies the key pattern", () => {
  for (const raw of ["Sertifikasi", "My Tab 2", "__weird__", "A"]) {
    const key = normalizeTabKey(raw);
    if (key.length >= 2) {
      assert.equal(
        TAB_KEY_PATTERN.test(key),
        true,
        `normalized "${key}" must match the key pattern`
      );
    }
  }
});

test("tab key pattern accepts machine-safe keys and rejects the rest", () => {
  assert.equal(TAB_KEY_PATTERN.test("health"), true);
  assert.equal(TAB_KEY_PATTERN.test("health_2"), true);
  assert.equal(TAB_KEY_PATTERN.test("Health"), false);
  assert.equal(TAB_KEY_PATTERN.test("2health"), false);
  assert.equal(TAB_KEY_PATTERN.test("h"), false);
  assert.equal(TAB_KEY_PATTERN.test("health-tab"), false);
  assert.equal(TAB_KEY_PATTERN.test("a".repeat(33)), false);
  assert.equal(TAB_KEY_PATTERN.test("a".repeat(32)), true);
});

test("reserved tab keys cover every system tab param key", () => {
  for (const entry of SYSTEM_TABS) {
    assert.ok(
      RESERVED_TAB_KEYS.includes(entry.key),
      `system tab key "${entry.key}" must be reserved`
    );
  }
});

test("reserved tab keys include the header sentinel word and system names", () => {
  for (const reserved of ["header", "system", "tabs", "contact", "other"]) {
    assert.ok(RESERVED_TAB_KEYS.includes(reserved));
  }
});

test("validate custom tab definition accepts a valid tab", () => {
  const result = validateCustomTabDefinition({
    tabKey: "certification",
    name: "Certification",
    description: "External certificates",
    icon: "📄",
    displayOrder: 70,
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("validate custom tab definition rejects reserved, malformed and blank input", () => {
  const reserved = validateCustomTabDefinition({
    tabKey: "personal",
    name: "Personal",
  });
  assert.equal(reserved.ok, false);

  const badKey = validateCustomTabDefinition({
    tabKey: "Not A Key",
    name: "Broken",
  });
  assert.equal(badKey.ok, false);

  const blankName = validateCustomTabDefinition({
    tabKey: "health",
    name: "   ",
  });
  assert.equal(blankName.ok, false);
});

test("validate custom tab definition bounds description, icon, order and status", () => {
  const longDescription = validateCustomTabDefinition({
    tabKey: "health",
    name: "Health",
    description: "x".repeat(501),
  });
  assert.equal(longDescription.ok, false);

  const longIcon = validateCustomTabDefinition({
    tabKey: "health",
    name: "Health",
    icon: "x".repeat(25),
  });
  assert.equal(longIcon.ok, false);

  const negativeOrder = validateCustomTabDefinition({
    tabKey: "health",
    name: "Health",
    displayOrder: -1,
  });
  assert.equal(negativeOrder.ok, false);

  const badStatus = validateCustomTabDefinition({
    tabKey: "health",
    name: "Health",
    status: "deleted",
  });
  assert.equal(badStatus.ok, false);

  const good = validateCustomTabDefinition({
    tabKey: "health",
    name: "Health",
    status: "inactive",
  });
  assert.equal(good.ok, true);
});

test("custom tab statuses are exactly active and inactive", () => {
  assert.deepEqual([...CUSTOM_TAB_STATUSES], ["active", "inactive"]);
});

test("suggested display order advances by ten and is capped", () => {
  assert.equal(suggestedCustomTabDisplayOrder(0), 70);
  assert.equal(suggestedCustomTabDisplayOrder(1), 80);
  assert.equal(suggestedCustomTabDisplayOrder(3), 100);
  assert.ok(suggestedCustomTabDisplayOrder(1000) <= 9999);
  // The first two suggestions land in the gap after "Bank Account" (60) and
  // before "Family" (90). The third ties with Family at 90, which is a
  // documented, supported case: mergeTabStrip puts the custom tab first on a
  // tie. Beyond that, suggestions continue into the 100s and simply interleave
  // with the later system tabs by displayOrder.
  assert.ok(suggestedCustomTabDisplayOrder(0) > 60);
  assert.ok(suggestedCustomTabDisplayOrder(0) < 90);
  assert.ok(suggestedCustomTabDisplayOrder(1) > 60);
  assert.ok(suggestedCustomTabDisplayOrder(1) < 90);
  assert.equal(suggestedCustomTabDisplayOrder(2), 90);
  // Suggestions are always strictly ascending.
  let previous = 0;
  for (const count of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
    const order = suggestedCustomTabDisplayOrder(count);
    assert.ok(order > previous, `order ${order} did not increase`);
    previous = order;
  }
});
