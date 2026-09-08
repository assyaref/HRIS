/**
 * PHASE 10.7C-44 — Standalone face enrollment revoke tests (node:test).
 *
 * Exercises the PURE revoke rules (`features/employees/face-enrollment.ts`)
 * plus source-level invariants of the revoke server action
 * (`features/employees/face-enrollment.actions.ts`):
 * - strict revoke input schema (the client can NEVER send organizationId,
 *   status, template, embedding, or a revocation flag);
 * - revocation guard (only an ACTIVE enrollment is revocable; cross-org and
 *   unknown employees resolve to the same generic response);
 * - safe audit metadata (only scalars, operation=revoked, no biometric data);
 * - server action authorization chain (requireUser → requirePermission
 *   EMPLOYEES_UPDATE → session organizationId → org-scoped lookup), the
 *   atomic revoke transaction (status flip + ciphertext deletion together,
 *   safe no-op when nothing is ACTIVE), and no plaintext biometric anywhere.
 *
 * Honest scope (mirrors Phase 10.2/10.4): real DB/transaction behavior is
 * covered by source invariants because this suite runs without a database.
 * The replacement/re-enrollment policy itself is covered by the unchanged
 * `tests/employees/face-enrollment.test.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildFaceEnrollmentAuditMetadata,
  evaluateFaceEnrollmentRevokeGuard,
  FACE_ENROLLMENT_MESSAGES,
  faceEnrollmentMessage,
  faceEnrollmentRevokeInputSchema,
  type FaceEnrollmentFailureReason,
} from "../../features/employees/face-enrollment.ts";

const EMPLOYEE_A = "11111111-1111-4111-8111-111111111111";

const FORBIDDEN_BIOMETRIC_TERMS = [
  "embedding",
  "descriptor",
  "template",
  "score",
  "threshold",
  "secret",
  "base64",
  "ciphertext",
];

function assertNoForbiddenTerms(label: string, serialized: string): void {
  const lower = serialized.toLowerCase();
  for (const term of FORBIDDEN_BIOMETRIC_TERMS) {
    assert.equal(
      lower.includes(term),
      false,
      `${label} must not contain "${term}": ${serialized}`
    );
  }
}

describe("faceEnrollmentRevokeInputSchema (server authority)", () => {
  it("accepts a valid employee ID only", () => {
    const parsed = faceEnrollmentRevokeInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
    });
    assert.equal(parsed.success, true);
  });

  it("rejects a malformed employee ID", () => {
    const parsed = faceEnrollmentRevokeInputSchema.safeParse({
      employeeId: "not-a-uuid",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a missing employee ID", () => {
    assert.equal(faceEnrollmentRevokeInputSchema.safeParse({}).success, false);
  });

  it("rejects a client-supplied organizationId (org is session-derived)", () => {
    const parsed = faceEnrollmentRevokeInputSchema.safeParse({
      employeeId: EMPLOYEE_A,
      organizationId: "99999999-9999-4999-8999-999999999999",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects client-controlled enrollment state and biometric fields", () => {
    for (const extra of [
      { status: "revoked" },
      { verified: true },
      { threshold: 0.5 },
      { template: "x" },
      { embedding: [0.1] },
      { score: 0.99 },
      { reenroll: true },
      { consent: true },
    ]) {
      const parsed = faceEnrollmentRevokeInputSchema.safeParse({
        employeeId: EMPLOYEE_A,
        ...extra,
      });
      assert.equal(
        parsed.success,
        false,
        `expected schema to reject ${JSON.stringify(extra)}`
      );
    }
  });
});

describe("evaluateFaceEnrollmentRevokeGuard (state rules)", () => {
  it("allows revoking an ACTIVE enrollment of a known employee", () => {
    assert.deepEqual(
      evaluateFaceEnrollmentRevokeGuard({
        employeeExists: true,
        hasActiveEnrollment: true,
      }),
      { ok: true }
    );
  });

  it("blocks a second revoke (no ACTIVE enrollment) with a safe reason", () => {
    const decision = evaluateFaceEnrollmentRevokeGuard({
      employeeExists: true,
      hasActiveEnrollment: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "no_active_enrollment");
      assert.match(decision.message, /belum memiliki data wajah aktif/i);
      assertNoForbiddenTerms("no_active_enrollment message", decision.message);
    }
  });

  it("blocks an unknown/cross-org employee with the SAME generic response", () => {
    const decision = evaluateFaceEnrollmentRevokeGuard({
      employeeExists: false,
      hasActiveEnrollment: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "employee_unavailable");
      assert.match(decision.message, /Karyawan tidak ditemukan/i);
      assertNoForbiddenTerms("employee_unavailable message", decision.message);
    }
  });

  it("is NOT gated on employment status (departed employees can be revoked)", () => {
    // The guard intentionally takes no `employeeActive` input: revocation is a
    // data-minimization action and must still work for inactive/departed
    // employees. It only removes capability, never grants it.
    assert.deepEqual(
      evaluateFaceEnrollmentRevokeGuard({
        employeeExists: true,
        hasActiveEnrollment: true,
      }),
      { ok: true }
    );
  });
});

describe("face enrollment revoke failure messages (no biometric payload)", () => {
  it("maps every failure reason to a message free of biometric terms", () => {
    const reasons = Object.keys(
      FACE_ENROLLMENT_MESSAGES
    ) as FaceEnrollmentFailureReason[];
    for (const reason of reasons) {
      assertNoForbiddenTerms(
        `message for ${reason}`,
        faceEnrollmentMessage(reason)
      );
    }
  });

  it("maps no_active_enrollment to a safe Indonesian message", () => {
    assert.match(
      faceEnrollmentMessage("no_active_enrollment"),
      /Karyawan belum memiliki data wajah aktif/i
    );
  });
});

describe("face enrollment revoke audit metadata", () => {
  it("records the ACTIVE → REVOKED transition with only safe scalars", () => {
    const metadata = buildFaceEnrollmentAuditMetadata({
      employeeId: EMPLOYEE_A,
      employeeNumber: "EMP-001",
      previousStatus: "ACTIVE",
      newStatus: "REVOKED",
      operation: "revoked",
    });
    assert.deepEqual(metadata, {
      employeeId: EMPLOYEE_A,
      employeeNumber: "EMP-001",
      previousStatus: "ACTIVE",
      newStatus: "REVOKED",
      operation: "revoked",
    });
    assertNoForbiddenTerms("revoke audit metadata", JSON.stringify(metadata));
  });
});

describe("revoke server action invariants (source)", () => {
  function readRepoFile(relative: string): string {
    return readFileSync(path.join(process.cwd(), relative), "utf8");
  }

  /** Extract one balanced function/action from the .actions.ts source. */
  function extractFunctionSource(source: string, marker: string): string {
    const startIndex = source.indexOf(marker);
    assert.ok(startIndex >= 0, `expected to find ${marker}`);
    const bodyStart = source.indexOf("{", startIndex);
    let depth = 0;
    let inString = false;
    let stringChar = "";
    for (let i = bodyStart; i < source.length; i += 1) {
      const ch = source[i];
      if (inString) {
        if (ch === "\\") {
          i += 1;
          continue;
        }
        if (ch === stringChar) inString = false;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        inString = true;
        stringChar = ch;
        continue;
      }
      if (ch === "{") depth += 1;
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) return source.slice(startIndex, i + 1);
      }
    }
    throw new Error(`could not extract ${marker}`);
  }

  const actionSource = readRepoFile(
    "features/employees/face-enrollment.actions.ts"
  );
  const revokeSource = extractFunctionSource(
    actionSource,
    "export async function revokeFaceEnrollmentAction("
  );

  it("revoke still authenticates and authorizes server-side first", () => {
    assert.match(revokeSource, /await requireUser\(\)/);
    assert.match(
      revokeSource,
      /await requirePermission\(user\.id,\s*PERMISSIONS\.EMPLOYEES_UPDATE\)/
    );
  });

  it("derives organizationId only from the authenticated session", () => {
    assert.match(revokeSource, /const organizationId = user\.organizationId;/);
    assert.equal(
      /const organizationId = formData\.get\("organizationId"\)/.test(
        revokeSource
      ),
      false
    );
  });

  it("resolves the employee through an org-scoped lookup (other-org = null)", () => {
    assert.match(
      revokeSource,
      /getEmployeeInOrganization\(\s*parsed\.data\.employeeId,\s*organizationId\s*\)/
    );
    assert.equal(/from\(employees\)/.test(revokeSource), false);
  });

  it("only ever revokes an ACTIVE enrollment", () => {
    assert.match(
      revokeSource,
      /eq\(employeeFaceEnrollments\.status,\s*"active"\)/
    );
  });

  it("treats a second revoke / concurrent replacement as a safe no-op", () => {
    // No ACTIVE row remaining → nothing is written and the action returns a
    // generic message (fail closed, no partial state).
    assert.match(revokeSource, /if \(activeRows\.length === 0\)/);
    assert.match(
      revokeSource,
      /faceEnrollmentMessage\("no_active_enrollment"\)/
    );
  });

  it("flips status to REVOKED and records revokedByUserId + revokedAt", () => {
    assert.match(revokeSource, /status: "revoked"/);
    assert.match(revokeSource, /revokedByUserId: user\.id/);
    assert.match(revokeSource, /revokedAt: new Date\(\)/);
  });

it("deletes the biometric ciphertext row in the SAME transaction", () => {
    assert.match(revokeSource, /db\.transaction\(/);
    const txIndex = revokeSource.indexOf("db.transaction(");
    const statusIndex = revokeSource.indexOf('status: "revoked"');
    const deleteIndex = revokeSource.indexOf(".delete(faceEnrollmentTemplates)");
    assert.ok(txIndex >= 0 && statusIndex >= 0 && deleteIndex >= 0);
    assert.ok(
      txIndex < statusIndex && statusIndex < deleteIndex,
      "status flip and ciphertext deletion must both happen inside the transaction"
    );
  });

  it("never inserts or persists biometric material on revoke", () => {
    assert.equal(revokeSource.includes(".insert(faceEnrollmentTemplates"), false);
    assert.equal(
      /secret:/.test(revokeSource),
      false,
      "revoke must never write a template/secret value"
    );
    assert.equal(
      revokeSource.includes("createFaceTemplateFromEnrollmentCapture"),
      false,
      "revoke must not call the face engine at all"
    );
  });

  it("writes the face_enrollment.revoked audit event with scalar metadata", () => {
    assert.match(revokeSource, /await writeAuditLog\(/);
    assert.match(revokeSource, /action: "face_enrollment\.revoked"/);
    assert.match(
      revokeSource,
      /metadata:\s*buildFaceEnrollmentAuditMetadata\(\{[\s\S]*?employeeId[\s\S]*?employeeNumber[\s\S]*?previousStatus[\s\S]*?newStatus[\s\S]*?operation: "revoked"/,
      "audit metadata must come from the scalar audit-metadata builder"
    );
  });

  it("never logs plaintext biometric content", () => {
    const lines = revokeSource.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("console.")) continue;
      assertNoForbiddenTerms(`log line in revoke action`, trimmed);
    }
  });

  it("leaves the existing replacement/re-enrollment behavior untouched", () => {
    // The enroll action still performs the controlled replace path.
    const enrollSource = extractFunctionSource(
      actionSource,
      "export async function enrollFaceAction("
    );
    assert.match(enrollSource, /plan\.operation === "replace"/);
    assert.match(enrollSource, /status: "revoked"/);
    assert.match(enrollSource, /\.insert\(faceEnrollmentTemplates\)/);
    assert.match(enrollSource, /\.delete\(faceEnrollmentTemplates\)/);
  });
});