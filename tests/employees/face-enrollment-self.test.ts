/**
 * PHASE 10.7C-50D — Employee SELF-SERVICE face enrollment tests (node:test).
 *
 * Covers the deterministic + source-level security contract of the
 * self-enrollment path:
 * - the self-only input schema (no employeeId / organizationId accepted);
 * - consent remains explicit, default-false and server-authoritative;
 * - the self-service server action resolves the employee ONLY from the
 *   authenticated session (user.id → org-scoped linked employee);
 * - missing org / missing linked employee / inactive employee fail safely;
 * - the existing admin management + revoke suites stay untouched and passing.
 *
 * Honest scope (mirrors Phase 10.2/10.4): real DB/engine behavior is covered
 * by source invariants because this suite runs without a database.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFaceEnrollmentConsent,
  evaluateFaceEnrollmentGuard,
  FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE,
  selfFaceEnrollmentInputSchema,
} from "../../features/employees/face-enrollment.ts";

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

function readRepoFile(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/** Extract one balanced function/action from a .actions.ts source. */
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

describe("selfFaceEnrollmentInputSchema (self-only, server authority)", () => {
  it("accepts only an explicit consent acknowledgement", () => {
    const parsed = selfFaceEnrollmentInputSchema.safeParse({ consent: true });
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.consent, true);
      assert.equal(parsed.data.reenroll, false);
    }
  });

  it("defaults consent and reenroll to false when omitted", () => {
    const parsed = selfFaceEnrollmentInputSchema.safeParse({});
    assert.equal(parsed.success, true);
    if (parsed.success) {
      assert.equal(parsed.data.consent, false);
      assert.equal(parsed.data.reenroll, false);
    }
  });

  it("rejects a client-supplied employeeId (self-only identity)", () => {
    const parsed = selfFaceEnrollmentInputSchema.safeParse({
      consent: true,
      employeeId: "11111111-1111-4111-8111-111111111111",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects a client-supplied organizationId", () => {
    const parsed = selfFaceEnrollmentInputSchema.safeParse({
      consent: true,
      organizationId: "22222222-2222-4222-8222-222222222222",
    });
    assert.equal(parsed.success, false);
  });

  it("rejects other client-controlled biometric/state fields", () => {
    for (const extra of [
      { status: "active" },
      { verified: true },
      { threshold: 0.5 },
      { template: "x" },
      { embedding: [0.1] },
      { score: 0.99 },
    ]) {
      const parsed = selfFaceEnrollmentInputSchema.safeParse({
        consent: true,
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

describe("self enrollment consent and unlinked-account messaging", () => {
  it("keeps consent mandatory (false is blocked with a safe message)", () => {
    const decision = evaluateFaceEnrollmentConsent(false);
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.match(decision.message, /Persetujuan pemrosesan data biometrik/i);
    }
    assert.deepEqual(evaluateFaceEnrollmentConsent(true), { ok: true });
  });

  it("exposes the exact Indonesian unlinked-account message", () => {
    assert.equal(
      FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE,
      "Akun Anda belum terhubung ke data karyawan."
    );
  });

  it("rejects an inactive employee through the existing enrollment guard", () => {
    const decision = evaluateFaceEnrollmentGuard({
      employeeExists: true,
      employeeActive: false,
      hasActiveEnrollment: false,
      allowReplacement: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "employee_unavailable");
    }
  });

  it("blocks duplicate enrollment without an explicit update request", () => {
    const decision = evaluateFaceEnrollmentGuard({
      employeeExists: true,
      employeeActive: true,
      hasActiveEnrollment: true,
      allowReplacement: false,
    });
    assert.equal(decision.ok, false);
    if (!decision.ok) {
      assert.equal(decision.reason, "already_enrolled");
    }
  });
});

describe("selfEnrollFaceAction source invariants (server authority)", () => {
  const actionSource = readRepoFile(
    "features/employees/face-enrollment.actions.ts"
  );
  const selfSource = extractFunctionSource(
    actionSource,
    "export async function selfEnrollFaceAction("
  );

  it("authenticates the request first", () => {
    assert.match(selfSource, /await requireUser\(\)/);
  });

  it("uses SELF-ONLY identity: linked employee from the session, not the client", () => {
    assert.match(
      selfSource,
      /getEmployeeByUserId\(\s*user\.id,\s*organizationId\s*\)/
    );
    assert.equal(
      /formData\.get\("employeeId"\)/.test(selfSource),
      false,
      "self enrollment must never read a client employeeId"
    );
    assert.equal(/employeeIdRaw/.test(selfSource), false);
    assert.equal(
      /getEmployeeInOrganization/.test(selfSource),
      false,
      "self enrollment must not use the client-id management lookup"
    );
  });

  it("fails closed when the session has no organization", () => {
    assert.match(selfSource, /if \(!user\.organizationId\)/);
  });

  it("rejects an account without a linked employee safely", () => {
    assert.match(
      selfSource,
      new RegExp(`FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE`)
    );
  });

  it("enforces consent before identity lookup or any biometric processing", () => {
    assert.match(selfSource, /evaluateFaceEnrollmentConsent\(parsed\.data\.consent\)/);
    const consentIndex = selfSource.indexOf("evaluateFaceEnrollmentConsent");
    const lookupIndex = selfSource.indexOf("getEmployeeByUserId(");
    const providerIndex = selfSource.indexOf(
      "createFaceTemplateFromEnrollmentCapture("
    );
    assert.ok(consentIndex >= 0 && lookupIndex >= 0 && providerIndex >= 0);
    assert.ok(
      consentIndex < lookupIndex && lookupIndex < providerIndex,
      "consent → identity lookup → provider processing ordering violated"
    );
  });

  it("rejects an inactive/duplicate employee through the existing guard", () => {
    assert.match(selfSource, /evaluateFaceEnrollmentGuard\(/);
    assert.match(
      selfSource,
      /employeeActive: employee\.employmentStatus === "active"/
    );
  });

  it("only ever persists the server-resolved employee", () => {
    // Both the provider input and the inserted row must use employee.id from
    // getEmployeeByUserId — never a client-supplied value.
    const providerIndex = selfSource.indexOf(
      "createFaceTemplateFromEnrollmentCapture("
    );
    const insertIndex = selfSource.indexOf(".insert(employeeFaceEnrollments)");
    assert.ok(providerIndex >= 0 && insertIndex >= 0);
    assert.ok(
      providerIndex < insertIndex,
      "provider input must precede persistence"
    );
    assert.match(selfSource, /employeeId: employee\.id/);
    assert.equal(
      /employeeId:\s*parsed\./.test(selfSource),
      false,
      "employeeId must never come from parsed client input"
    );
  });

  it("persists ciphertext and audits scalars inside the existing pipeline", () => {
    assert.match(selfSource, /db\.transaction\(/);
    assert.match(selfSource, /\.insert\(faceEnrollmentTemplates\)/);
    assert.match(selfSource, /await writeAuditLog\(/);
    assert.match(selfSource, /action: auditAction/);
    assert.match(selfSource, /buildFaceEnrollmentAuditMetadata\(/);
    assert.match(selfSource, /face_enrollment\.replaced/);
    assert.match(selfSource, /face_enrollment\.created/);
  });

  it("never logs plaintext biometric content", () => {
    const lines = selfSource.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("console.")) continue;
      assertNoForbiddenTerms(`log line in self action`, trimmed);
    }
  });

  it("revalidates the self-service route after a write", () => {
    assert.match(selfSource, /revalidatePath\("\/face-id"\)/);
  });
});

describe("getEmployeeByUserId remains the org-scoped identity mapping", () => {
  const queriesSource = readRepoFile("features/employees/queries.ts");
  const fnSource = extractFunctionSource(
    queriesSource,
    "export async function getEmployeeByUserId("
  );

  it("scopes the linked-employee lookup by BOTH user and organization", () => {
    assert.match(fnSource, /eq\(employees\.userId,\s*userId\)/);
    assert.match(fnSource, /eq\(employees\.organizationId,\s*organizationId\)/);
    assert.match(fnSource, /\.limit\(1\)/);
  });
});

describe("self-service page + panel never expose an employee selector", () => {
  const originalPanelSource = readRepoFile(
    "features/employees/face-enrollment-self-panel.tsx"
  );
  const panelSource = originalPanelSource.toLowerCase();
  const pageSource = readRepoFile("app/(dashboard)/face-id/page.tsx");

  it("the panel never collects or sends an employeeId", () => {
    assert.equal(panelSource.includes('name="employeeid"'), false);
    assert.equal(panelSource.includes('formdata.append("employeeid"'), false);
    assert.equal(panelSource.includes("getemployeeinorganization"), false);
  });

  it("the panel posts only to the self action and reuses the existing camera", () => {
    assert.match(panelSource, /selfenrollfaceaction/);
    assert.match(panelSource, /faceenrollmentcamera/);
    assert.equal(
      /\benrollFaceAction\b/.test(originalPanelSource),
      false,
      "self panel must import the self action, not the admin enroll action"
    );
  });

  it("the panel uses no browser storage, geolocation or persisted images", () => {
    for (const api of [
      "localstorage",
      "sessionstorage",
      "indexeddb",
      "watchposition",
      "url.createobjecturl",
      "todataurl",
      "data:image",
    ]) {
      assert.equal(
        panelSource.includes(api),
        false,
        `self panel must not use ${api}`
      );
    }
  });

  it("the page resolves the employee from the authenticated user only", () => {
    assert.match(pageSource, /requireUser\(\)/);
    assert.match(pageSource, /getEmployeeByUserId\(user\.id,\s*organizationId\)/);
    assert.equal(/getEmployeeInOrganization/.test(pageSource), false);
  });

  it("the page shows the safe unlinked message when there is no mapping", () => {
    assert.match(pageSource, /FACE_SELF_ENROLLMENT_UNLINKED_MESSAGE/);
  });
});

// CHUNK-END