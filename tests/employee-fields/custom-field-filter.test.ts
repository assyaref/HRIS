/**
 * Dynamic custom-field search/filter (Employee Master Data 2.0).
 *
 * Pure unit tests for the definition-driven parser: predicates are chosen by
 * field TYPE (never by name), only ACTIVE specs may be filtered, invalid /
 * unknown / duplicate / out-of-range values are dropped, and multi-field
 * filters are all returned for the (server-side, org-scoped) SQL layer.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CUSTOM_FILTER_PARAM_PREFIX,
  MAX_CUSTOM_FIELD_FILTERS,
  isFieldVisibleToRoles,
  isFieldEditableByRoles,
  isFieldWritableByRoles,
  parseCustomFieldFilters,
  parseCustomFieldPredicate,
  toCustomFieldFilterSpec,
  type CustomFieldFilterSpec,
} from "../../features/employee-fields/filtering.ts";

const shirtSize: CustomFieldFilterSpec = {
  fieldDefinitionId: "fid-shirt",
  fieldKey: "shirt_size",
  label: "Shirt Size",
  fieldType: "select",
  options: ["S", "M", "L", "XL", "XXL"],
};

const vehicleNumber: CustomFieldFilterSpec = {
  fieldDefinitionId: "fid-vehicle",
  fieldKey: "vehicle_number",
  label: "Vehicle Number",
  fieldType: "text",
  options: [],
};

const joinedDate: CustomFieldFilterSpec = {
  fieldDefinitionId: "fid-joined",
  fieldKey: "joined_on",
  label: "Joined",
  fieldType: "date",
  options: [],
};

const salary: CustomFieldFilterSpec = {
  fieldDefinitionId: "fid-salary",
  fieldKey: "expected_salary",
  label: "Salary",
  fieldType: "currency",
  options: [],
};

const uniform: CustomFieldFilterSpec = {
  fieldDefinitionId: "fid-uniform",
  fieldKey: "uniform_sizes",
  label: "Uniform Sizes",
  fieldType: "multiselect",
  options: ["S", "M", "L"],
};

const active: CustomFieldFilterSpec = {
  fieldDefinitionId: "fid-active",
  fieldKey: "is_active",
  label: "Active",
  fieldType: "checkbox",
  options: [],
};

const SPECS = [
  shirtSize,
  vehicleNumber,
  joinedDate,
  salary,
  uniform,
  active,
];

describe("predicate parsing is type-driven (never by name)", () => {
  it("select only accepts defined options", () => {
    assert.deepEqual(
      parseCustomFieldPredicate(shirtSize, "XL"),
      { kind: "optionAny", value: "XL" }
    );
    assert.equal(parseCustomFieldPredicate(shirtSize, "XXXL"), null);
  });

  it("text accepts any non-empty contains value", () => {
    assert.deepEqual(
      parseCustomFieldPredicate(vehicleNumber, " B-1234 "),
      { kind: "contains", value: "B-1234" }
    );
    assert.equal(parseCustomFieldPredicate(vehicleNumber, "   "), null);
  });

  it("date requires YYYY-MM-DD", () => {
    assert.deepEqual(parseCustomFieldPredicate(joinedDate, "2024-01-02"), {
      kind: "dateEq",
      value: "2024-01-02",
    });
    assert.equal(parseCustomFieldPredicate(joinedDate, "02-01-2024"), null);
  });

  it("currency requires a finite number", () => {
    assert.deepEqual(parseCustomFieldPredicate(salary, "12500.50"), {
      kind: "numberEq",
      value: 12500.5,
    });
    assert.equal(parseCustomFieldPredicate(salary, "twelve"), null);
  });

  it("multiselect still validates membership of the option list", () => {
    assert.deepEqual(parseCustomFieldPredicate(uniform, "M"), {
      kind: "optionAny",
      value: "M",
    });
    assert.equal(parseCustomFieldPredicate(uniform, "XXXL"), null);
  });

  it("checkbox maps truthy/falsy tokens to a boolean predicate", () => {
    assert.deepEqual(parseCustomFieldPredicate(active, "true"), {
      kind: "booleanEq",
      value: true,
    });
    assert.deepEqual(parseCustomFieldPredicate(active, "no"), {
      kind: "booleanEq",
      value: false,
    });
    assert.equal(parseCustomFieldPredicate(active, "maybe"), null);
  });
});

describe("parseCustomFieldFilters", () => {
  it("returns only filters for keys present in the ACTIVE specs", () => {
    const filters = parseCustomFieldFilters(
      { [`${CUSTOM_FILTER_PARAM_PREFIX}shirt_size`]: "XL" },
      SPECS
    );
    assert.equal(filters.length, 1);
    assert.equal(filters[0]?.spec.fieldDefinitionId, "fid-shirt");
    assert.equal(filters[0]?.predicate.kind, "optionAny");
  });

  it("ignores unknown field keys (never a hard-coded allow list)", () => {
    const filters = parseCustomFieldFilters(
      { [`${CUSTOM_FILTER_PARAM_PREFIX}secret_field`]: "x" },
      SPECS
    );
    assert.equal(filters.length, 0);
  });

  it("drops filters whose value fails the type rules", () => {
    const filters = parseCustomFieldFilters(
      { [`${CUSTOM_FILTER_PARAM_PREFIX}shirt_size`]: "XXXL" },
      SPECS
    );
    assert.equal(filters.length, 0);
  });

  it("supports multiple simultaneous filters", () => {
    const filters = parseCustomFieldFilters(
      {
        [`${CUSTOM_FILTER_PARAM_PREFIX}shirt_size`]: "L",
        [`${CUSTOM_FILTER_PARAM_PREFIX}vehicle_number`]: "B-9",
      },
      SPECS
    );
    assert.equal(filters.length, 2);
    const keys = filters.map((filter) => filter.spec.fieldKey).sort();
    assert.deepEqual(keys, ["shirt_size", "vehicle_number"]);
  });

  it("ignores core (non-prefixed) query params", () => {
    const filters = parseCustomFieldFilters(
      { q: "jane", status: "active" },
      SPECS
    );
    assert.equal(filters.length, 0);
  });

  it("caps the number of simultaneous filters", () => {
    const manySpecs: CustomFieldFilterSpec[] = [];
    const params: Record<string, string> = {};
    for (let index = 0; index < MAX_CUSTOM_FIELD_FILTERS + 10; index += 1) {
      const spec = {
        fieldDefinitionId: `fid-${index}`,
        fieldKey: `field_${index}`,
        label: `Field ${index}`,
        fieldType: "text" as const,
        options: [],
      };
      manySpecs.push(spec);
      params[`${CUSTOM_FILTER_PARAM_PREFIX}field_${index}`] = "value";
    }
    const filters = parseCustomFieldFilters(params, manySpecs);
    assert.equal(filters.length, MAX_CUSTOM_FIELD_FILTERS);
  });

  it("a field the caller may not filter is never produced", () => {
    // Simulate an inactive/archived field: it is simply not in the specs the
    // caller receives (only active+visible definitions are ever passed).
    const filters = parseCustomFieldFilters(
      { [`${CUSTOM_FILTER_PARAM_PREFIX}retired_field`]: "value" },
      SPECS
    );
    assert.equal(filters.length, 0);
  });
});

describe("role visibility helpers (server decision, reused everywhere)", () => {
  it("empty config is visible/editable to every role", () => {
    assert.equal(isFieldVisibleToRoles([], ["EMPLOYEE"]), true);
    assert.equal(isFieldEditableByRoles([], []), true);
  });

  it("a restricted field is invisible to roles outside its config", () => {
    assert.equal(isFieldVisibleToRoles(["HR"], ["MANAGEMENT"]), false);
    assert.equal(isFieldVisibleToRoles(["HR"], ["HR"]), true);
    assert.equal(isFieldEditableByRoles(["ADMIN"], ["HR"]), false);
    assert.equal(isFieldEditableByRoles(["ADMIN", "HR"], ["HR"]), true);
  });

  it("write authorization requires both visibility and edit access", () => {
    assert.equal(isFieldWritableByRoles([], [], ["HR"]), true);
    assert.equal(isFieldWritableByRoles(["ADMIN"], [], ["HR"]), false);
    assert.equal(isFieldWritableByRoles([], ["ADMIN"], ["HR"]), false);
    assert.equal(isFieldWritableByRoles(["HR"], ["HR"], ["HR"]), true);
  });
});

describe("toCustomFieldFilterSpec", () => {
  it("narrows a definition row to a filterable spec", () => {
    const spec = toCustomFieldFilterSpec({
      id: "fid-1",
      fieldKey: "blood_type",
      label: "Blood Type",
      fieldType: "text",
      options: [],
    });
    assert.deepEqual(spec, {
      fieldDefinitionId: "fid-1",
      fieldKey: "blood_type",
      label: "Blood Type",
      fieldType: "text",
      options: [],
    });
  });
});
