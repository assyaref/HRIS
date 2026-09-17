/**
 * PM-04 — Payslip PDF document layer guard tests (Node `node:test`).
 *
 * These exercise the PURE decision and validation functions in
 * features/payroll/payslip-document.guard.ts:
 * - UUID and PDF mime-type acceptance used by the upload action and PDF route.
 * - Stored-name sanitization (path/control character neutralization + 255 cap)
 *   and header-name sanitization (quote/backslash neutralization + ".pdf").
 * - The owner-vs-management access rule shared by the PDF route and the
 *   published-payslip detail page.
 * - The publish-gate missing-document count used by publishPayslipsAction.
 * No DB, no auth, no filesystem, no Ghostscript, no browser.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPayslipDocumentAccessDecision,
  canViewPublishedPayslip,
  countPayslipsMissingDocuments,
  isPayslipPdfMimeType,
  isPayslipUuid,
  sanitizePayslipHeaderFilename,
  sanitizePayslipOriginalFilename,
} from "../../features/payroll/payslip-document.guard.ts";

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const EMPLOYEE_OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EMPLOYEE_OTHER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("isPayslipUuid", () => {
  it("accepts a well-formed v4 UUID", () => {
    assert.equal(isPayslipUuid(VALID_UUID), true);
  });

  it("accepts other allowed UUID versions and the uppercase hex variant", () => {
    assert.equal(isPayslipUuid("11111111-1111-1111-8111-111111111111"), true);
    assert.equal(isPayslipUuid("11111111-1111-5111-A111-111111111111"), true);
  });

  it("rejects non-UUID strings", () => {
    assert.equal(isPayslipUuid("not-a-uuid"), false);
    assert.equal(isPayslipUuid(""), false);
    assert.equal(isPayslipUuid("11111111-1111-4111-8111"), false);
  });

  it("rejects disallowed version and variant bits", () => {
    assert.equal(isPayslipUuid("11111111-1111-6111-8111-111111111111"), false);
    assert.equal(isPayslipUuid("11111111-1111-4111-7111-111111111111"), false);
  });

  it("rejects out-of-range hex characters", () => {
    assert.equal(isPayslipUuid("11111111-1111-4111-8111-11111111111g"), false);
  });
});

describe("isPayslipPdfMimeType", () => {
  it("accepts application/pdf and the empty string", () => {
    assert.equal(isPayslipPdfMimeType("application/pdf"), true);
    assert.equal(isPayslipPdfMimeType(""), true);
  });

  it("rejects other mime types", () => {
    assert.equal(isPayslipPdfMimeType("text/plain"), false);
    assert.equal(isPayslipPdfMimeType("application/octet-stream"), false);
    assert.equal(isPayslipPdfMimeType("Application/PDF"), false);
  });
});

describe("sanitizePayslipOriginalFilename", () => {
  it("keeps a simple file name unchanged", () => {
    assert.equal(
      sanitizePayslipOriginalFilename("payslip.pdf"),
      "payslip.pdf"
    );
  });

  it("strips directory paths (Windows and POSIX)", () => {
    assert.equal(
      sanitizePayslipOriginalFilename("C:\\Users\\u\\slides\\payslip.pdf"),
      "payslip.pdf"
    );
    assert.equal(
      sanitizePayslipOriginalFilename("uploads/2026/09/payslip.pdf"),
      "payslip.pdf"
    );
  });

  it("strips control characters", () => {
    assert.equal(
      sanitizePayslipOriginalFilename("pay\nslip.pdf"),
      "payslip.pdf"
    );
    assert.equal(
      sanitizePayslipOriginalFilename("pay\u0000slip.pdf"),
      "payslip.pdf"
    );
  });

  it("trims surrounding whitespace", () => {
    assert.equal(
      sanitizePayslipOriginalFilename("  confidential.pdf\t"),
      "confidential.pdf"
    );
  });

  it("falls back to payslip.pdf when nothing remains", () => {
    assert.equal(sanitizePayslipOriginalFilename("/"), "payslip.pdf");
    assert.equal(sanitizePayslipOriginalFilename("\u0000"), "payslip.pdf");
    assert.equal(sanitizePayslipOriginalFilename("  "), "payslip.pdf");
  });

  it("caps a long file name at 255 characters", () => {
    const longName = `${"a".repeat(300)}.pdf`;
    const sanitized = sanitizePayslipOriginalFilename(longName);

    assert.equal(sanitized.length, 255);
    assert.equal(sanitized, longName.slice(0, 255));
  });
});

describe("sanitizePayslipHeaderFilename", () => {
  it("keeps a simple file name unchanged", () => {
    assert.equal(
      sanitizePayslipHeaderFilename("payslip.pdf"),
      "payslip.pdf"
    );
  });

  it("strips quote and backslash characters", () => {
    assert.equal(
      sanitizePayslipHeaderFilename('pay"slip.pdf'),
      "payslip.pdf"
    );
    assert.equal(
      sanitizePayslipHeaderFilename("pay\\slip.pdf"),
      "payslip.pdf"
    );
  });

  it("strips control characters and trims", () => {
    assert.equal(
      sanitizePayslipHeaderFilename("pay\nslip.pdf"),
      "payslip.pdf"
    );
    assert.equal(
      sanitizePayslipHeaderFilename("  payslip.pdf  "),
      "payslip.pdf"
    );
  });

  it("appends the .pdf extension when missing", () => {
    assert.equal(
      sanitizePayslipHeaderFilename("payslip"),
      "payslip.pdf"
    );
  });

  it("preserves a case-sensitive .pdf suffix only", () => {
    assert.equal(
      sanitizePayslipHeaderFilename("payslip.PDF"),
      "payslip.PDF.pdf"
    );
  });

  it("falls back to payslip.pdf when nothing remains", () => {
    assert.equal(sanitizePayslipHeaderFilename(""), "payslip.pdf");
    assert.equal(sanitizePayslipHeaderFilename('""'), "payslip.pdf");
  });
});

describe("canViewPublishedPayslip", () => {
  it("allows the linked owner without management access", () => {
    assert.equal(
      canViewPublishedPayslip({
        linkedEmployeeId: EMPLOYEE_OWNER,
        payslipEmployeeId: EMPLOYEE_OWNER,
        managementAllowed: false,
      }),
      true
    );
  });

  it("denies a non-owner employee without management access", () => {
    assert.equal(
      canViewPublishedPayslip({
        linkedEmployeeId: EMPLOYEE_OTHER,
        payslipEmployeeId: EMPLOYEE_OWNER,
        managementAllowed: false,
      }),
      false
    );
  });

  it("denies an unlinked employee without management access", () => {
    assert.equal(
      canViewPublishedPayslip({
        linkedEmployeeId: null,
        payslipEmployeeId: EMPLOYEE_OWNER,
        managementAllowed: false,
      }),
      false
    );
  });

  it("allows management for any linked or unlinked employee", () => {
    assert.equal(
      canViewPublishedPayslip({
        linkedEmployeeId: EMPLOYEE_OTHER,
        payslipEmployeeId: EMPLOYEE_OWNER,
        managementAllowed: true,
      }),
      true
    );
    assert.equal(
      canViewPublishedPayslip({
        linkedEmployeeId: null,
        payslipEmployeeId: EMPLOYEE_OWNER,
        managementAllowed: true,
      }),
      true
    );
  });

  it("allows an owning employee who also has management access", () => {
    assert.equal(
      canViewPublishedPayslip({
        linkedEmployeeId: EMPLOYEE_OWNER,
        payslipEmployeeId: EMPLOYEE_OWNER,
        managementAllowed: true,
      }),
      true
    );
  });
});

describe("countPayslipsMissingDocuments", () => {
  const payslipA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const payslipB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const payslipC = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  it("returns zero when every payslip has a document", () => {
    assert.equal(
      countPayslipsMissingDocuments([payslipA, payslipB], [payslipA, payslipB]),
      0
    );
  });

  it("counts only the payslips that lack a document", () => {
    assert.equal(
      countPayslipsMissingDocuments(
        [payslipA, payslipB, payslipC],
        [payslipA]
      ),
      2
    );
  });

  it("counts all payslips as missing when no document exists", () => {
    assert.equal(
      countPayslipsMissingDocuments([payslipA, payslipB, payslipC], []),
      3
    );
  });

  it("returns zero for an empty pending list", () => {
    assert.equal(countPayslipsMissingDocuments([], [payslipA]), 0);
  });

  it("ignores duplicate document ids", () => {
    assert.equal(
      countPayslipsMissingDocuments(
        [payslipA, payslipB],
        [payslipA, payslipA, payslipB, payslipB]
      ),
      0
    );
  });
});

describe("buildPayslipDocumentAccessDecision", () => {
  const ownerContext = {
    linkedEmployeeId: EMPLOYEE_OWNER,
    payslipEmployeeId: EMPLOYEE_OWNER,
    managementAllowed: false,
  };

  it("denies a non-owner employee and records no audit decision", () => {
    const decision = buildPayslipDocumentAccessDecision({
      linkedEmployeeId: EMPLOYEE_OTHER,
      payslipEmployeeId: EMPLOYEE_OWNER,
      managementAllowed: false,
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.recordAudit, false);
  });

  it("allows the owning employee and records an audit decision", () => {
    const decision = buildPayslipDocumentAccessDecision(
      ownerContext
    );

    assert.equal(decision.allowed, true);
    assert.equal(decision.recordAudit, true);
  });

  it("allows management access and records an audit decision", () => {
    const decision = buildPayslipDocumentAccessDecision({
      linkedEmployeeId: EMPLOYEE_OTHER,
      payslipEmployeeId: EMPLOYEE_OWNER,
      managementAllowed: true,
    });

    assert.equal(decision.allowed, true);
    assert.equal(decision.recordAudit, true);
  });

  it("denies an actor without a linked employee unless management applies", () => {
    const denied = buildPayslipDocumentAccessDecision({
      linkedEmployeeId: null,
      payslipEmployeeId: EMPLOYEE_OWNER,
      managementAllowed: false,
    });
    const managed = buildPayslipDocumentAccessDecision({
      linkedEmployeeId: null,
      payslipEmployeeId: EMPLOYEE_OWNER,
      managementAllowed: true,
    });

    assert.equal(denied.allowed, false);
    assert.equal(denied.recordAudit, false);
    assert.equal(managed.allowed, true);
    assert.equal(managed.recordAudit, true);
  });

  it("stays organization-agnostic: cross-org identity is never a decision input", () => {
    /*
     * The pure decision carries no organization dimension. Cross-organization
     * UUIDs must therefore be impossible to distinguish from missing
     * payslips: the route performs the org-scoped lookup and answers with the
     * same generic not-found response whether the payslip does not exist,
     * belongs to another organization, or was never published.
     */
    const decision = buildPayslipDocumentAccessDecision({
      linkedEmployeeId: EMPLOYEE_OWNER,
      payslipEmployeeId: EMPLOYEE_OWNER,
      managementAllowed: false,
    });

    assert.deepEqual(decision, { allowed: true, recordAudit: true });
  });
});
