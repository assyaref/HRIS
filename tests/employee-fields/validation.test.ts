import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_FIELD_TYPES,
  FIELD_KEY_PATTERN,
  parseCustomFieldValue,
  validateCustomFieldDefinition,
} from "../../features/employee-fields/validation.ts";

test("custom field definition: accepts a valid text field", () => {
  const result = validateCustomFieldDefinition({
    fieldKey: "blood_type",
    label: "Blood Type",
    fieldType: "text",
    section: "Personal",
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test("custom field definition: rejects uppercase / starting-digit keys", () => {
  assert.equal(FIELD_KEY_PATTERN.test("BloodType"), false);
  assert.equal(FIELD_KEY_PATTERN.test("2fast2furious"), false);
  assert.equal(FIELD_KEY_PATTERN.test("x"), false);
  assert.equal(FIELD_KEY_PATTERN.test("ok_1"), true);
});

test("custom field definition: select requires non-empty unique options", () => {
  const empty = validateCustomFieldDefinition({
    fieldKey: "shirt_size",
    label: "Shirt Size",
    fieldType: "select",
    options: [],
  });
  assert.equal(empty.ok, false);
  assert.ok(empty.errors[0]?.includes("Options are required"));

  const dupes = validateCustomFieldDefinition({
    fieldKey: "shirt_size",
    label: "Shirt Size",
    fieldType: "select",
    options: ["M", "M", "L"],
  });
  assert.equal(dupes.ok, false);
  assert.ok(dupes.errors.some((error) => error.includes("unique")));
});

test("custom field definition: text does not require options", () => {
  const result = validateCustomFieldDefinition({
    fieldKey: "notes_field",
    label: "Notes",
    fieldType: "textarea",
  });
  assert.equal(result.ok, true);
});

test("custom field value: parses number and currency", () => {
  const numberValue = parseCustomFieldValue("number", "42");
  assert.equal(numberValue.ok, true);
  if (numberValue.ok) assert.equal(numberValue.value.valueNumber, "42");

  const currencyValue = parseCustomFieldValue("currency", "1500.5");
  if (currencyValue.ok) assert.equal(currencyValue.value.valueNumber, "1500.50");
});

test("custom field value: rejects non-numeric number", () => {
  const result = parseCustomFieldValue("number", "abc");
  assert.equal(result.ok, false);
  if (!result.ok) assert.ok(result.error.includes("number"));
});

test("custom field value: parses checkbox booleans", () => {
  const yes = parseCustomFieldValue("checkbox", "yes");
  const no = parseCustomFieldValue("checkbox", "false");
  if (yes.ok) assert.equal(yes.value.valueBoolean, true);
  if (no.ok) assert.equal(no.value.valueBoolean, false);
});

test("custom field value: select must belong to options", () => {
  const ok = parseCustomFieldValue("select", "M", ["S", "M", "L"]);
  assert.equal(ok.ok, true);
  const bad = parseCustomFieldValue("select", "XL", ["S", "M", "L"]);
  assert.equal(bad.ok, false);
});

test("custom field value: multiselect parses comma-separated options", () => {
  const ok = parseCustomFieldValue("multiselect", "S, M", ["S", "M", "L"]);
  assert.equal(ok.ok, true);
  if (ok.ok) assert.deepEqual(ok.value.valueJson, ["S", "M"]);

  const bad = parseCustomFieldValue("multiselect", "S, ZZZ", ["S", "M", "L"]);
  assert.equal(bad.ok, false);
});

test("custom field value: date must be a valid calendar date", () => {
  const ok = parseCustomFieldValue("date", "1999-08-15");
  assert.equal(ok.ok, true);
  const invalid = parseCustomFieldValue("date", "1999-02-31");
  assert.equal(invalid.ok, false);
});

test("custom field value: empty input clears the field", () => {
  const result = parseCustomFieldValue("email", "");
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.valueText, null);
});

test("custom field value: rejects malformed email and url", () => {
  assert.equal(parseCustomFieldValue("email", "not-an-email").ok, false);
  assert.equal(parseCustomFieldValue("url", "ftp://x").ok, false);
  assert.equal(parseCustomFieldValue("url", "https://x.dev").ok, true);
});

test("custom field value: every declared type parses its canonical input", () => {
  for (const fieldType of CUSTOM_FIELD_TYPES) {
    const example =
      fieldType === "select" || fieldType === "radio"
        ? "A"
        : fieldType === "multiselect"
          ? "A"
          : fieldType === "checkbox"
            ? "true"
            : fieldType === "date"
              ? "2020-01-01"
              : fieldType === "datetime"
                ? "2020-01-01T10:00:00.000Z"
                : fieldType === "number"
                  ? "7"
                  : fieldType === "currency"
                    ? "1.20"
                    : fieldType === "email"
                      ? "a@b.example"
                      : fieldType === "phone"
                        ? "+6281234567890"
                        : fieldType === "url"
                          ? "https://x.dev"
                          : "hello";
    const result = parseCustomFieldValue(fieldType, example, ["A", "B"]);
    assert.equal(result.ok, true, `${fieldType} should accept its example`);
  }
});