import assert from "node:assert/strict";
import test from "node:test";

import {
  maskBankAccountNumber,
  maskBpjsNumber,
  maskEmail,
  maskNIK,
  maskNpwp,
  maskPhoneNumber,
  maskSensitiveField,
} from "../../features/employees/masking.ts";

test("masking: NIK keeps the last four digits in 4-4-4-4 grouping", () => {
  assert.equal(maskNIK("1234123412341234"), "**** **** **** 1234");
});

test("masking: short NIK is returned unmasked (no reveal)", () => {
  assert.equal(maskNIK("123"), "123");
});

test("masking: empty and null NIK pass through unchanged", () => {
  assert.equal(maskNIK("") ?? "", "");
  assert.equal(maskNIK(null), null);
  assert.equal(maskNIK(undefined), null);
});

test("masking: NPWP keeps the last three digits", () => {
  assert.equal(maskNpwp("123456789012345"), "************345");
});

test("masking: BPJS number keeps the last four digits", () => {
  assert.equal(maskBpjsNumber("2201123401234567"), "************4567");
});

test("masking: bank account keeps the last four digits", () => {
  assert.equal(maskBankAccountNumber("12345678"), "****5678");
});

test("masking: phone number keeps the last four digits", () => {
  assert.equal(maskPhoneNumber("081234567890"), "********7890");
});

test("masking: email masks the local part but keeps domain", () => {
  assert.equal(maskEmail("johndoe@example.com"), "j*****e@example.com");
});

test("masking: single-character local part masks entirely", () => {
  assert.equal(maskEmail("j@example.com"), "*@example.com");
});

test("masking: maskSensitiveField routes by kind", () => {
  assert.equal(maskSensitiveField("nik", "1234123412341234"), "**** **** **** 1234");
  assert.equal(maskSensitiveField("bank_account", "99887766"), "****7766");
  assert.equal(maskSensitiveField("bpjs", "1234567890"), "******7890");
  assert.equal(maskSensitiveField("npwp", "123456789012345"), "************345");
  assert.equal(maskSensitiveField("phone", "081234567890"), "********7890");
  assert.equal(maskSensitiveField("email", "jane@acme.co"), "j**e@acme.co");
});

test("masking: maskSensitiveField never reveals more than the tail", () => {
  const nik = "1234123412341234";
  const masked = maskNIK(nik);
  assert.equal(masked?.endsWith("1234"), true);
  assert.equal(masked?.includes("1234123412341"), false);
  assert.equal(masked, "**** **** **** 1234");
});