/**
 * Change password input validation (Node built-in `node:test`).
 *
 * Exercises the PURE zod schema in `features/account/change-password-schema.ts`:
 * required fields, the 8-character minimum, confirmation matching, and the
 * "must differ from the current password" rule.
 *
 * Authentication (session-derived target account), the server-side
 * Argon2id verification of the current password and the session revocation are
 * enforced in `features/account/actions.ts` and are NOT exercised here — that
 * path needs a database and a request scope, and this repository has no
 * database-backed test harness.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { changePasswordSchema } from "../../features/account/change-password-schema.ts";

function parse(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}) {
  return changePasswordSchema.safeParse(input);
}

describe("change password schema", () => {
  it("accepts a valid payload", () => {
    const result = parse({
      currentPassword: "current-secret",
      newPassword: "brand-new-secret",
      confirmPassword: "brand-new-secret",
    });
    assert.equal(result.success, true);
  });

  it("requires the current password", () => {
    const result = parse({
      currentPassword: "",
      newPassword: "brand-new-secret",
      confirmPassword: "brand-new-secret",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], "currentPassword");
    }
  });

  it("requires the confirmation field", () => {
    const result = parse({
      currentPassword: "current-secret",
      newPassword: "brand-new-secret",
      confirmPassword: "",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], "confirmPassword");
    }
  });

  it("rejects a new password shorter than 8 characters", () => {
    const result = parse({
      currentPassword: "current-secret",
      newPassword: "short7c",
      confirmPassword: "short7c",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], "newPassword");
    }
  });

  it("accepts a new password of exactly 8 characters", () => {
    const result = parse({
      currentPassword: "current-secret",
      newPassword: "12345678",
      confirmPassword: "12345678",
    });
    assert.equal(result.success, true);
  });

  it("accepts a new password of exactly 128 characters", () => {
    const newPassword = "a".repeat(128);
    const result = parse({
      currentPassword: "current-secret",
      newPassword,
      confirmPassword: newPassword,
    });
    assert.equal(result.success, true);
  });

  it("rejects a new password longer than 128 characters", () => {
    const newPassword = "a".repeat(129);
    const result = parse({
      currentPassword: "current-secret",
      newPassword,
      confirmPassword: newPassword,
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], "newPassword");
    }
  });

  it("rejects a mismatched confirmation", () => {
    const result = parse({
      currentPassword: "current-secret",
      newPassword: "brand-new-secret",
      confirmPassword: "different-secret",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], "confirmPassword");
    }
  });

  it("rejects reusing the current password as the new password", () => {
    const result = parse({
      currentPassword: "same-secret",
      newPassword: "same-secret",
      confirmPassword: "same-secret",
    });
    assert.equal(result.success, false);
    if (!result.success) {
      assert.equal(result.error.issues[0]?.path[0], "newPassword");
    }
  });
});