/**
 * ANNOUNCEMENT ATTACHMENT STORAGE — node:test suite (source contracts).
 *
 * Pins the private-filesystem path-resolution invariants for announcement
 * attachments, the same invariants the employee-document folder removal was
 * hardened to satisfy:
 *
 *   - ROOT-CANNOT-BE-TARGETED: the announcement folder removal is a RECURSIVE
 *     delete (`rm(..., { recursive: true, force: true })`). If its target could
 *     ever resolve to the private root itself, it would erase EVERY
 *     announcement attachment on the instance. The target must therefore
 *     resolve STRICTLY INSIDE the root, and the root is refused outright.
 *   - UUID-ONLY SEGMENTS: the folder segment originates from `announcements.id`
 *     (a `uuid` column), so `..`, `.`, absolute paths and empty strings are
 *     refused before they can reach the filesystem.
 *   - STORE == DELETE: the store and the removal resolve the folder through
 *     ONE function, so an attachment can only be written to a folder the
 *     removal is allowed to delete (and vice versa).
 *   - FILE-LEVEL RESOLVERS ARE STRICT TOO: `resolveWithinRoot` refuses the
 *     root itself in every module, so no file-level resolver can ever name a
 *     directory that a later recursive delete would treat as its target.
 *   - REFUSALS ARE VISIBLE: the folder removal reports its outcome
 *     (`removed` + `error`) instead of swallowing a refusal, so a refused
 *     deletion is observable rather than silent.
 *
 * The behavioural (filesystem) proof runs in the operator rehearsal phase
 * against a sandbox root; this suite pins the shipped source contracts.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

const readRepoFile = (relative: string): string =>
  readFileSync(path.join(process.cwd(), relative), "utf8");

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const announcementStorageSource = stripComments(
  readRepoFile("lib/announcements/attachment-storage.ts")
);
const employeeStorageSource = stripComments(
  readRepoFile("lib/employee-documents/storage.ts")
);
const payslipPdfSource = stripComments(
  readRepoFile("lib/payroll/payslip-pdf.ts")
);

describe("announcement attachment storage", () => {
  it("the announcement folder removal can never target the private root itself", () => {
    // `rm(path, { recursive: true })` on the private root would erase EVERY
    // announcement attachment on the instance, so the target must be strictly
    // inside it and the path segment must be a database UUID.
    assert.equal(
      announcementStorageSource.includes("function resolveAnnouncementFolder("),
      true,
      "the folder removal uses a dedicated strict resolver"
    );
    assert.equal(
      announcementStorageSource.includes("UUID_PATH_SEGMENT.test(announcementId)"),
      true,
      "the path segment must be validated as a database UUID"
    );
    assert.equal(
      announcementStorageSource.includes(
        "if (!resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`))"
      ),
      true,
      "the target must resolve strictly inside the root, never the root itself"
    );
    assert.equal(
      announcementStorageSource.includes(
        "await rm(resolveAnnouncementFolder(announcementId)"
      ),
      true,
      "the removal uses the strict resolver"
    );
    assert.equal(
      announcementStorageSource.includes(
        "resolveWithinRoot(PRIVATE_ROOT, announcementId)"
      ),
      false,
      "the folder removal no longer resolves a raw segment against the root"
    );
  });

  it("the attachment store and the folder removal resolve the same folder", () => {
    assert.equal(
      announcementStorageSource.includes(
        "const directory = resolveAnnouncementFolder(input.announcementId);"
      ),
      true,
      "the store uses the same strict resolver as the removal"
    );
    assert.equal(
      announcementStorageSource.includes(
        "resolveWithinRoot(directory, fileName)"
      ),
      true,
      "the file name is still resolved strictly inside that folder"
    );
  });

  it("the folder removal reports its outcome instead of swallowing it", () => {
    assert.equal(
      announcementStorageSource.includes(
        "export interface AnnouncementStorageRemoval"
      ),
      true,
      "the removal returns a typed outcome"
    );
    assert.equal(
      announcementStorageSource.includes("): Promise<AnnouncementStorageRemoval> {"),
      true,
      "the removal resolves with that outcome"
    );
    assert.equal(
      announcementStorageSource.includes(
        "return { removed: true, error: null };"
      ),
      true,
      "a successful (or already-absent) folder removal reports removed=true"
    );
    assert.equal(
      announcementStorageSource.includes("removed: false,"),
      true,
      "a refusal or I/O error reports removed=false"
    );
    assert.equal(
      announcementStorageSource.includes(
        "error: error instanceof Error ? error.message : String(error)"
      ),
      true,
      "the refusal is reported with the message, not swallowed"
    );
  });

  it("every private-root resolver refuses the root itself", () => {
    // A resolver that allows `resolved === root` can name a directory that a
    // later recursive delete would treat as its target, so the root is
    // refused in every module.
    for (const [label, source] of [
      ["announcements", announcementStorageSource],
      ["employee documents", employeeStorageSource],
    ] as const) {
      assert.equal(
        source.includes("resolved !== root &&"),
        false,
        `${label}: the resolver must not make an exception for the root itself`
      );
      assert.equal(
        source.includes("resolved !== PRIVATE_ROOT &&"),
        false,
        `${label}: the resolver must not make an exception for the root itself`
      );
      assert.equal(
        source.includes("if (!resolved.startsWith(`${root}${path.sep}`))"),
        true,
        `${label}: the resolved path must be strictly inside the root`
      );
    }

    assert.equal(
      payslipPdfSource.includes("resolved !== PRIVATE_ROOT &&"),
      false,
      "payslips: the storage-path resolver must not make an exception for the root"
    );
    assert.equal(
      payslipPdfSource.includes(
        "if (!resolved.startsWith(`${PRIVATE_ROOT}${path.sep}`))"
      ),
      true,
      "payslips: the resolved path must be strictly inside the root"
    );
  });

  it("the employee-document resolvers keep their hardened invariants", () => {
    assert.equal(
      employeeStorageSource.includes("function resolveEmployeeDocumentFolder("),
      true,
      "the employee folder removal keeps its dedicated strict resolver"
    );
    assert.equal(
      employeeStorageSource.includes(
        "await rm(resolveEmployeeDocumentFolder(organizationId, employeeId)"
      ),
      true,
      "the employee folder removal uses the strict resolver"
    );
    assert.equal(
      employeeStorageSource.includes(
        "resolveWithinRoot(PRIVATE_ROOT, `${organizationId}/${employeeId}`)"
      ),
      false,
      "the employee folder removal does not interpolate raw segments"
    );
  });
});
