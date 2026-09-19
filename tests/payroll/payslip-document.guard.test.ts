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
  buildPayslipPdfReplaceDecision,
  buildPayslipPdfUploadDecision,
  canViewPublishedPayslip,
  countPayslipsMissingDocuments,
  hasPayslipPdfExtension,
  isPayslipPdfMimeType,
  isPayslipUuid,
  nextPayslipDocumentVersion,
  PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH,
  PAYSLIP_DOCUMENT_SOURCES,
  payslipDocumentSourceFrom,
  PAYSLIP_PDF_MAX_SIZE_BYTES,
  resolveHistoricalPayslipPasswordIdentity,
  sanitizePayslipHeaderFilename,
  sanitizePayslipOriginalFilename,
} from "../../features/payroll/payslip-document.guard.ts";
import { buildPayslipPassword } from "../../lib/payroll/payslip-pdf-password.ts";

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

describe("hasPayslipPdfExtension", () => {
  it("accepts a lowercase .pdf extension", () => {
    assert.equal(hasPayslipPdfExtension("payslip.pdf"), true);
    assert.equal(hasPayslipPdfExtension("2026-09-payslip.pdf"), true);
  });

  it("accepts an uppercase or mixed-case extension", () => {
    assert.equal(hasPayslipPdfExtension("payslip.PDF"), true);
    assert.equal(hasPayslipPdfExtension("payslip.Pdf"), true);
  });

  it("accepts a name that still ends in .pdf from a raw browser path", () => {
    assert.equal(hasPayslipPdfExtension("C:\\Users\\Me\\payslip.pdf"), true);
    assert.equal(hasPayslipPdfExtension("uploads/2026/payslip.pdf"), true);
  });

  it("rejects filenames without a .pdf extension", () => {
    assert.equal(hasPayslipPdfExtension("payslip"), false);
    assert.equal(hasPayslipPdfExtension("payslip.txt"), false);
    assert.equal(hasPayslipPdfExtension("payslip.pdf.txt"), false);
    assert.equal(hasPayslipPdfExtension("payslip.docx"), false);
  });

  it("rejects empty and whitespace-only names", () => {
    assert.equal(hasPayslipPdfExtension(""), false);
    assert.equal(hasPayslipPdfExtension("   "), false);
  });
});

describe("buildPayslipPdfUploadDecision", () => {
  const valid = {
    mimeType: "application/pdf",
    filename: "payslip.pdf",
    size: 4096,
  };

  it("allows a valid application/pdf file with a .pdf extension", () => {
    assert.deepEqual(buildPayslipPdfUploadDecision(valid), {
      allowed: true,
      message: "",
    });
  });

  it("allows an empty MIME type when the extension and size are fine", () => {
    const decision = buildPayslipPdfUploadDecision({
      ...valid,
      mimeType: "",
    });

    assert.equal(decision.allowed, true);
  });

  it("allows a file exactly at the 20 MB limit", () => {
    const decision = buildPayslipPdfUploadDecision({
      ...valid,
      size: PAYSLIP_PDF_MAX_SIZE_BYTES,
    });

    assert.equal(decision.allowed, true);
  });

  it("rejects an empty file", () => {
    const decision = buildPayslipPdfUploadDecision({
      ...valid,
      size: 0,
    });

    assert.deepEqual(decision, {
      allowed: false,
      message: "The selected PDF is empty.",
    });
  });

  it("rejects negative and non-finite sizes", () => {
    for (const size of [-1, NaN, Infinity]) {
      const decision = buildPayslipPdfUploadDecision({ ...valid, size });

      assert.equal(decision.allowed, false, String(size));
      assert.equal(decision.message, "The selected PDF is empty.");
    }
  });

  it("rejects a file above the 20 MB limit", () => {
    const decision = buildPayslipPdfUploadDecision({
      ...valid,
      size: PAYSLIP_PDF_MAX_SIZE_BYTES + 1,
    });

    assert.deepEqual(decision, {
      allowed: false,
      message: "The payslip PDF must not exceed 20 MB.",
    });
  });

  it("rejects a non-PDF MIME type", () => {
    const decision = buildPayslipPdfUploadDecision({
      ...valid,
      mimeType: "text/plain",
    });

    assert.equal(decision.allowed, false);
    assert.equal(decision.message, "Only PDF files are allowed.");
  });

  it("rejects a file without a .pdf extension", () => {
    const decision = buildPayslipPdfUploadDecision({
      ...valid,
      filename: "payslip.txt",
    });

    assert.equal(decision.allowed, false);
    assert.equal(
      decision.message,
      "The payslip file must have a .pdf extension."
    );
  });

  it("reports the first failing rule only", () => {
    const nonPdf = buildPayslipPdfUploadDecision({
      mimeType: "text/plain",
      filename: "payslip.txt",
      size: PAYSLIP_PDF_MAX_SIZE_BYTES + 1,
    });
    const oversizedEmpty = buildPayslipPdfUploadDecision({
      mimeType: "application/pdf",
      filename: "payslip.pdf",
      size: 0,
    });

    assert.equal(nonPdf.message, "The payslip PDF must not exceed 20 MB.");
    assert.equal(oversizedEmpty.message, "The selected PDF is empty.");
  });
});

/*
 * PM-08 (Phase 3.6B) — Controlled payslip PDF replacement.
 *
 * The pure replace decision owns the replacement window: a current document
 * must exist, the payslip must still be generated, the run must be
 * approved/locked, the new file must pass the shared PDF guard, and a bounded
 * reason is required. RBAC, organization scope, and transaction/storage
 * behavior are enforced by the server action, not this pure module.
 */
describe("buildPayslipPdfReplaceDecision", () => {
  const validReplace = {
    mimeType: "application/pdf",
    filename: "payslip.pdf",
    size: 4096,
    reason: "Corrected net amount after recalculation",
    payslipStatus: "generated",
    runStatus: "approved",
    hasExistingDocument: true,
  };

  it("allows a valid replacement on an approved run", () => {
    assert.deepEqual(buildPayslipPdfReplaceDecision(validReplace), {
      allowed: true,
      message: "",
    });
  });

  it("allows a valid replacement on a locked run", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      runStatus: "locked",
    });

    assert.equal(decision.allowed, true);
  });

  it("requires an existing document (replacement never creates)", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      hasExistingDocument: false,
    });

    assert.equal(decision.allowed, false);
    assert.equal(
      decision.message,
      "There is no payslip document to replace."
    );
  });

  it("denies replacement when the payslip is published", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipStatus: "published",
    });

    assert.equal(decision.allowed, false);
  });

  it("denies replacement when the payslip is revoked", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipStatus: "revoked",
    });

    assert.equal(decision.allowed, false);
  });

  it("denies replacement unless the run is approved or locked", () => {
    for (const runStatus of ["draft", "calculated", "submitted", "cancelled", null]) {
      const decision = buildPayslipPdfReplaceDecision({
        ...validReplace,
        runStatus,
      });

      assert.equal(decision.allowed, false, String(runStatus));
    }
  });

  it("reuses the shared file validation (empty, oversized, MIME, extension)", () => {
    assert.equal(
      buildPayslipPdfReplaceDecision({ ...validReplace, size: 0 }).message,
      "The selected PDF is empty."
    );
    assert.equal(
      buildPayslipPdfReplaceDecision({
        ...validReplace,
        size: PAYSLIP_PDF_MAX_SIZE_BYTES + 1,
      }).message,
      "The payslip PDF must not exceed 20 MB."
    );
    assert.equal(
      buildPayslipPdfReplaceDecision({
        ...validReplace,
        mimeType: "text/plain",
      }).message,
      "Only PDF files are allowed."
    );
    assert.equal(
      buildPayslipPdfReplaceDecision({
        ...validReplace,
        filename: "payslip.txt",
      }).message,
      "The payslip file must have a .pdf extension."
    );
  });

  it("requires a non-empty (trimmed) reason", () => {
    assert.equal(
      buildPayslipPdfReplaceDecision({ ...validReplace, reason: "" }).message,
      "A reason for replacing the payslip PDF is required."
    );
    assert.equal(
      buildPayslipPdfReplaceDecision({
        ...validReplace,
        reason: "   \n\t ",
      }).allowed,
      false
    );
  });

  it("accepts a reason exactly at the 1000 character limit", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      reason: "a".repeat(PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH),
    });

    assert.equal(decision.allowed, true);
  });

  it("rejects a reason above the 1000 character limit", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      reason: "a".repeat(
        PAYSLIP_DOCUMENT_REPLACE_REASON_MAX_LENGTH + 1
      ),
    });

    assert.equal(decision.allowed, false);
    assert.match(decision.message, /1000 characters/);
  });

  it("reports the first failing rule only (state before file)", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipStatus: "published",
      mimeType: "text/plain",
    });

    assert.match(decision.message, /Only generated payslips/);
  });

  it("allows a distribution replacement when the period is open", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipKind: "distribution",
      runStatus: null,
      periodStatus: "open",
    });

    assert.deepEqual(decision, { allowed: true, message: "" });
  });

  it("denies a distribution replacement for a locked period", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipKind: "distribution",
      runStatus: null,
      periodStatus: "locked",
    });

    assert.equal(decision.allowed, false);
    assert.match(decision.message, /cancelled or locked/);
  });

  it("denies a distribution replacement for a cancelled period", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipKind: "distribution",
      runStatus: null,
      periodStatus: "cancelled",
    });

    assert.equal(decision.allowed, false);
  });

  it("ignores the run status for distribution payslips", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      payslipKind: "distribution",
      runStatus: "draft",
      periodStatus: "open",
    });

    assert.equal(decision.allowed, true);
  });

  it("ignores the period status for calculated payslips", () => {
    const decision = buildPayslipPdfReplaceDecision({
      ...validReplace,
      periodStatus: "locked",
    });

    assert.equal(decision.allowed, true);
  });
});

describe("nextPayslipDocumentVersion", () => {
  it("starts at version 1 when no history exists", () => {
    assert.equal(nextPayslipDocumentVersion([]), 1);
  });

  it("produces version 2 for the first replacement", () => {
    assert.equal(nextPayslipDocumentVersion([1]), 2);
  });

  it("produces version 3 for the second replacement", () => {
    assert.equal(nextPayslipDocumentVersion([1, 2]), 3);
  });

  it("is monotonic and order/duplicate independent", () => {
    assert.equal(nextPayslipDocumentVersion([2, 1, 1]), 3);
    assert.equal(nextPayslipDocumentVersion([3, 1, 2]), 4);
  });

  it("ignores non-finite version values", () => {
    assert.equal(
      nextPayslipDocumentVersion([NaN, Infinity, -Infinity, 2]),
      3
    );
  });
});

describe("payslipDocumentSourceFrom", () => {
  it("exposes exactly generated, uploaded, and legacy as known sources", () => {
    assert.deepEqual(
      [...PAYSLIP_DOCUMENT_SOURCES],
      ["generated", "uploaded", "legacy"]
    );
  });

  it("preserves each known source value", () => {
    assert.equal(payslipDocumentSourceFrom("generated"), "generated");
    assert.equal(payslipDocumentSourceFrom("uploaded"), "uploaded");
    assert.equal(payslipDocumentSourceFrom("legacy"), "legacy");
  });

  it("falls back to generated for unknown, null, and undefined input", () => {
    assert.equal(payslipDocumentSourceFrom("something-else"), "generated");
    assert.equal(payslipDocumentSourceFrom(null), "generated");
    assert.equal(payslipDocumentSourceFrom(undefined), "generated");
  });
});

describe("resolveHistoricalPayslipPasswordIdentity", () => {
  const SNAPSHOT_NUMBER = "03233";
  const SNAPSHOT_BIRTH = new Date("1995-08-25T00:00:00.000Z");
  const CHANGED_NUMBER = "04567";
  const CHANGED_BIRTH = new Date("1996-01-10T00:00:00.000Z");

  it("prefers the payslip snapshots over every live value", () => {
    const resolved = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: SNAPSHOT_NUMBER,
      payslipBirthDateSnapshot: SNAPSHOT_BIRTH,
      itemEmployeeNumberSnapshot: "09999",
      liveEmployeeNumber: CHANGED_NUMBER,
      liveBirthDate: CHANGED_BIRTH,
    });

    assert.equal(resolved.employeeNumber, SNAPSHOT_NUMBER);
    assert.equal(resolved.birthDate, SNAPSHOT_BIRTH);
    assert.equal(resolved.usedLiveFallback, false);
  });

  it("keeps the historical password after the employee master changes", () => {
    const before = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: SNAPSHOT_NUMBER,
      payslipBirthDateSnapshot: SNAPSHOT_BIRTH,
      liveEmployeeNumber: SNAPSHOT_NUMBER,
      liveBirthDate: SNAPSHOT_BIRTH,
    });
    const after = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: SNAPSHOT_NUMBER,
      payslipBirthDateSnapshot: SNAPSHOT_BIRTH,
      liveEmployeeNumber: CHANGED_NUMBER,
      liveBirthDate: CHANGED_BIRTH,
    });

    const passwordBefore = buildPayslipPassword(
      before.employeeNumber!,
      before.birthDate!
    );
    const passwordAfter = buildPayslipPassword(
      after.employeeNumber!,
      after.birthDate!
    );

    assert.equal(passwordBefore, "0323325081995");
    assert.equal(passwordAfter, "0323325081995");
    assert.equal(passwordAfter, passwordBefore);
  });

  it("uses the payroll item number snapshot when the payslip has none", () => {
    const resolved = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: null,
      payslipBirthDateSnapshot: SNAPSHOT_BIRTH,
      itemEmployeeNumberSnapshot: SNAPSHOT_NUMBER,
      liveEmployeeNumber: CHANGED_NUMBER,
      liveBirthDate: CHANGED_BIRTH,
    });

    assert.equal(resolved.employeeNumber, SNAPSHOT_NUMBER);
    assert.equal(resolved.birthDate, SNAPSHOT_BIRTH);
    assert.equal(resolved.usedLiveFallback, false);
  });

  it("falls back to the live employee only for legacy rows and flags it", () => {
    const resolved = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: null,
      payslipBirthDateSnapshot: null,
      itemEmployeeNumberSnapshot: null,
      liveEmployeeNumber: CHANGED_NUMBER,
      liveBirthDate: CHANGED_BIRTH,
    });

    assert.equal(resolved.employeeNumber, CHANGED_NUMBER);
    assert.equal(resolved.birthDate, CHANGED_BIRTH);
    assert.equal(resolved.usedLiveFallback, true);
  });

  it("flags a fallback when only one component is missing", () => {
    const resolved = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: SNAPSHOT_NUMBER,
      payslipBirthDateSnapshot: null,
      liveEmployeeNumber: SNAPSHOT_NUMBER,
      liveBirthDate: CHANGED_BIRTH,
    });

    assert.equal(resolved.employeeNumber, SNAPSHOT_NUMBER);
    assert.equal(resolved.birthDate, CHANGED_BIRTH);
    assert.equal(resolved.usedLiveFallback, true);
  });

  it("returns nulls when no source exists and does not flag a fallback", () => {
    const resolved = resolveHistoricalPayslipPasswordIdentity({
      payslipEmployeeNumberSnapshot: null,
      payslipBirthDateSnapshot: null,
      itemEmployeeNumberSnapshot: null,
      liveEmployeeNumber: null,
      liveBirthDate: null,
    });

    assert.equal(resolved.employeeNumber, null);
    assert.equal(resolved.birthDate, null);
    assert.equal(resolved.usedLiveFallback, false);
  });
});
